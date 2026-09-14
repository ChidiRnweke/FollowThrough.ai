import type { SyncScheduler } from './scheduler';
import type { SynchronizationResult } from './contracts';
import type { SubmissionResult } from './mutation-queue';

type Lane = 'pull' | 'writes';
type Result = SynchronizationResult | SubmissionResult;
interface LaneState {
	requested: boolean;
	running: Promise<void> | null;
	retry: number | null;
	failures: number;
	error: string | null;
}
export interface WorkspaceSyncRuntimeDependencies {
	scheduler: SyncScheduler;
	initialize(): Promise<void>;
	pull(): Promise<Result>;
	writes(): Promise<Result>;
	failed(message: string | null): void;
}

/** One wake-up owner. Independent lanes retain requests arriving during their work. */
export class WorkspaceSyncRuntime {
	private readonly lanes: Record<Lane, LaneState> = {
		pull: { requested: false, running: null, retry: null, failures: 0, error: null },
		writes: { requested: false, running: null, retry: null, failures: 0, error: null }
	};
	private writeWake: { at: number } | null = null;
	private online = true;
	private stopped = false;
	private cancelWake: (() => void) | null = null;
	readonly writeScheduler: SyncScheduler;
	constructor(private readonly dependencies: WorkspaceSyncRuntimeDependencies) {
		this.writeScheduler = {
			now: () => dependencies.scheduler.now(),
			schedule: (at) => {
				const retry = { at };
				this.writeWake = retry;
				this.schedule();
				return () => {
					if (this.writeWake === retry) this.writeWake = null;
					this.schedule();
				};
			}
		};
	}
	setOnline(online: boolean): void {
		this.online = online;
		this.schedule();
	}
	stop(): void {
		this.stopped = true;
		this.cancelWake?.();
		this.cancelWake = null;
	}
	async synchronize(force = false): Promise<void> {
		if (force) for (const state of Object.values(this.lanes)) state.retry = null;
		await Promise.all([this.request('pull'), this.request('writes')]);
	}
	committed(): void {
		void this.request('pull');
	}
	changed(): void {
		this.lanes.writes.retry = null;
		void this.request('writes');
	}
	private request(lane: Lane): Promise<void> {
		const state = this.lanes[lane];
		state.requested = true;
		if (this.stopped || !this.online) return Promise.resolve();
		if (state.retry !== null && state.retry > this.dependencies.scheduler.now())
			return Promise.resolve();
		state.running ??= this.run(lane)
			.then(() => undefined)
			.finally(() => {
				state.running = null;
				this.schedule();
				if (state.requested && !state.retry && !this.stopped && this.online)
					void this.request(lane);
			});
		return state.running;
	}
	private async run(lane: Lane): Promise<void | { kind: 'failure' }> {
		const state = this.lanes[lane];
		do {
			state.requested = false;
			state.retry = null;
			try {
				await this.dependencies.initialize();
				if (this.stopped || !this.online) return;
				const result = await this.dependencies[lane]();
				if (result.kind === 'failure') throw new Error(result.message);
				state.failures = 0;
				state.error = null;
				this.notifyFailures();
			} catch (error) {
				if (this.stopped) return { kind: 'failure' };
				state.failures++;
				// The queue excludes individual operations until their own deadlines. Its wake-up
				// must never hold back a newly queued independent operation.
				if (lane !== 'writes' || !this.writeWake)
					state.retry =
						this.dependencies.scheduler.now() +
						Math.min(60_000, 1000 * 2 ** Math.min(state.failures - 1, 6));
				state.error = error instanceof Error ? error.message : 'Workspace synchronization failed';
				this.notifyFailures();
				return { kind: 'failure' };
			}
		} while (state.requested && !this.stopped && this.online);
	}
	private notifyFailures(): void {
		this.dependencies.failed(
			Object.values(this.lanes).find((state) => state.error !== null)?.error ?? null
		);
	}

	private schedule(): void {
		this.cancelWake?.();
		this.cancelWake = null;
		if (this.stopped || !this.online) return;
		const deadlines = Object.values(this.lanes).flatMap((state) =>
			!state.running && state.retry !== null ? [state.retry] : []
		);
		if (this.writeWake && !this.lanes.writes.running) deadlines.push(this.writeWake.at);
		if (!deadlines.length) return;
		this.cancelWake = this.dependencies.scheduler.schedule(Math.min(...deadlines), async () => {
			this.cancelWake = null;
			await Promise.all(
				(Object.keys(this.lanes) as Lane[]).map((lane) => {
					const state = this.lanes[lane];
					const now = this.dependencies.scheduler.now();
					const queueDue = lane === 'writes' && this.writeWake !== null && this.writeWake.at <= now;
					if (!queueDue && (state.retry === null || state.retry > now)) return;
					if (queueDue) this.writeWake = null;
					return this.request(lane);
				})
			);
		});
	}
}
