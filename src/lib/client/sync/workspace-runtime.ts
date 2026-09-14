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
	result: Result;
}
export interface WorkspaceSyncRuntimeDependencies {
	scheduler: SyncScheduler;
	pull(): Promise<Result>;
	writes(): Promise<Result>;
	failed(message: string | null): void;
}
const delay = (attempts: number) => Math.min(60_000, 1000 * 2 ** Math.min(attempts - 1, 6));
/** One execution owner and clock for replication, writer admission and per-operation retries. */
export class WorkspaceSyncRuntime {
	private readonly lanes: Record<Lane, LaneState> = {
		pull: { requested: false, running: null, retry: null, failures: 0, result: { kind: 'idle' } },
		writes: { requested: false, running: null, retry: null, failures: 0, result: { kind: 'idle' } }
	};
	private readonly writeRetries = new Map<string, { attempts: number; at: number }>();
	private connected = true;
	private closed = false;
	private cancelWake: (() => void) | null = null;
	constructor(private readonly dependencies: WorkspaceSyncRuntimeDependencies) {}
	get online(): boolean {
		return this.connected;
	}
	get stopped(): boolean {
		return this.closed;
	}
	get writeStatus(): SubmissionResult {
		return this.closed
			? { kind: 'stopped' }
			: !this.connected
				? { kind: 'offline' }
				: this.lanes.writes.result;
	}
	get failure(): string | null {
		for (const lane of Object.values(this.lanes))
			if (lane.result.kind === 'failure') return lane.result.message;
		return null;
	}
	setOnline(online: boolean): void {
		this.connected = online;
		this.schedule();
	}
	stop(): void {
		this.closed = true;
		this.cancelWake?.();
		this.cancelWake = null;
	}
	retryNow(): void {
		for (const retry of this.writeRetries.values()) retry.at = 0;
		for (const lane of Object.values(this.lanes)) lane.retry = null;
	}
	excludedWrites(): ReadonlySet<string> {
		return new Set(
			[...this.writeRetries]
				.filter(([, retry]) => retry.at > this.dependencies.scheduler.now())
				.map(([id]) => id)
		);
	}
	deferWrite(id: string): void {
		const attempts = (this.writeRetries.get(id)?.attempts ?? 0) + 1;
		this.writeRetries.set(id, {
			attempts,
			at: this.dependencies.scheduler.now() + delay(attempts)
		});
	}
	clearWriteRetry(id: string): void {
		this.writeRetries.delete(id);
	}
	retainWriteRetries(ids: ReadonlySet<string>): void {
		for (const id of this.writeRetries.keys()) if (!ids.has(id)) this.writeRetries.delete(id);
	}
	async flushWrites(force = false): Promise<SubmissionResult> {
		if (force) this.retryNow();
		await this.request('writes');
		return this.writeStatus;
	}
	async synchronize(force = false): Promise<void> {
		if (force) this.retryNow();
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
		if (this.closed || !this.connected) return Promise.resolve();
		if (state.retry !== null && state.retry > this.dependencies.scheduler.now())
			return Promise.resolve();
		state.running ??= this.run(lane).finally(() => {
			state.running = null;
			this.schedule();
			if (state.requested && state.retry === null && !this.closed && this.connected)
				void this.request(lane);
		});
		return state.running;
	}
	private async run(lane: Lane): Promise<void> {
		const state = this.lanes[lane];
		do {
			state.requested = false;
			state.retry = null;
			let operationFailure = false;
			try {
				if (this.closed || !this.connected) return;
				state.result = await this.dependencies[lane]();
				if (state.result.kind === 'failure') {
					operationFailure = lane === 'writes' && this.writeRetries.size > 0;
					throw new Error(state.result.message);
				}
				if (state.result.kind === 'waiting')
					state.retry = this.dependencies.scheduler.now() + delay(++state.failures);
				else state.failures = 0;
				this.dependencies.failed(this.failure);
				// audit-allow: silent-catch — the lane retains a typed failure exposed by writeStatus/failure, notifies its subscriber, and schedules retry.
			} catch (error) {
				if (this.closed) return;
				state.result = {
					kind: 'failure',
					message: error instanceof Error ? error.message : 'Workspace synchronization failed'
				};
				// Operation deadlines exclude only their own writes, not newly queued independent work.
				if (!operationFailure)
					state.retry = this.dependencies.scheduler.now() + delay(++state.failures);
				this.dependencies.failed(this.failure);
				return;
			}
		} while (state.requested && !this.closed && this.connected);
	}
	private schedule(): void {
		this.cancelWake?.();
		this.cancelWake = null;
		if (this.closed || !this.connected) return;
		const deadlines = Object.values(this.lanes).flatMap((state) =>
			!state.running && state.retry !== null ? [state.retry] : []
		);
		if (!this.lanes.writes.running && this.lanes.writes.retry === null)
			deadlines.push(...[...this.writeRetries.values()].map((retry) => retry.at));
		if (!deadlines.length) return;
		this.cancelWake = this.dependencies.scheduler.schedule(Math.min(...deadlines), async () => {
			this.cancelWake = null;
			const now = this.dependencies.scheduler.now();
			await Promise.all(
				(['pull', 'writes'] as const).map((lane) => {
					const state = this.lanes[lane];
					if (
						(state.retry !== null && state.retry <= now) ||
						(lane === 'writes' && [...this.writeRetries.values()].some((retry) => retry.at <= now))
					)
						return this.request(lane);
				})
			);
		});
	}
}
