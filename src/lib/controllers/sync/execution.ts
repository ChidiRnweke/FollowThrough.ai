import type { SubmissionResult, SyncLane, SyncScheduler } from '$lib/models/sync';
import type { ISyncSchedulingService } from '$lib/services/sync/scheduling';
import type { SyncExecutionStore } from '$lib/stores/sync/execution';

export interface WorkspaceSynchronizationDependencies {
	readonly scheduler: SyncScheduler;
	pull(): Promise<SubmissionResult>;
	writes(): Promise<SubmissionResult>;
	failed(message: string | null): void;
}
export interface WorkspaceSynchronizationController {
	readonly online: boolean;
	readonly stopped: boolean;
	readonly writeStatus: SubmissionResult;
	readonly failure: string | null;
	setOnline(online: boolean): void;
	stop(): void;
	retryNow(): void;
	excludedWrites(): ReadonlySet<string>;
	deferWrite(id: string): void;
	clearWriteRetry(id: string): void;
	retainWriteRetries(ids: ReadonlySet<string>): void;
	flushWrites(force?: boolean): Promise<SubmissionResult>;
	synchronize(force?: boolean): Promise<void>;
	committed(): void;
	changed(): void;
}

/** Coordinates the independent replication and submission lanes for one account. */
export class WorkspaceSynchronization implements WorkspaceSynchronizationController {
	constructor(
		private readonly dependencies: WorkspaceSynchronizationDependencies,
		private readonly state: SyncExecutionStore,
		private readonly scheduling: ISyncSchedulingService
	) {}
	get online(): boolean {
		return this.state.online;
	}
	get stopped(): boolean {
		return this.state.stopped;
	}
	get writeStatus(): SubmissionResult {
		return this.stopped
			? { kind: 'stopped' }
			: !this.online
				? { kind: 'offline' }
				: this.state.lane('writes').result;
	}
	get failure(): string | null {
		for (const lane of Object.values(this.lanes()))
			if (lane.result.kind === 'failure') return lane.result.message;
		return null;
	}
	setOnline(online: boolean): void {
		if (this.stopped) return;
		this.state.setOnline(online);
		this.schedule();
	}
	stop(): void {
		this.state.stop();
		this.state.takeWake()?.();
	}
	retryNow(): void {
		if (this.stopped) return;
		for (const [id, retry] of this.state.writeRetries())
			this.state.setWriteRetry(id, { ...retry, at: 0 });
		for (const lane of ['pull', 'writes'] as const) this.state.updateLane(lane, { retry: null });
	}
	excludedWrites(): ReadonlySet<string> {
		return this.scheduling.excludedWrites(
			this.state.writeRetries(),
			this.dependencies.scheduler.now()
		);
	}
	deferWrite(id: string): void {
		if (this.stopped) return;
		const attempts = (this.state.writeRetries().get(id)?.attempts ?? 0) + 1;
		this.state.setWriteRetry(id, {
			attempts,
			at: this.scheduling.retryAt(attempts, this.dependencies.scheduler.now())
		});
	}
	clearWriteRetry(id: string): void {
		this.state.deleteWriteRetry(id);
	}
	retainWriteRetries(ids: ReadonlySet<string>): void {
		for (const id of this.state.writeRetries().keys())
			if (!ids.has(id)) this.state.deleteWriteRetry(id);
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
		if (this.stopped) return;
		this.state.updateLane('writes', { retry: null });
		void this.request('writes');
	}
	private lanes() {
		return { pull: this.state.lane('pull'), writes: this.state.lane('writes') };
	}
	private request(lane: SyncLane): Promise<void> {
		if (this.stopped) return Promise.resolve();
		this.state.updateLane(lane, { requested: true });
		const state = this.state.lane(lane);
		if (this.stopped || !this.online) return Promise.resolve();
		if (state.retry !== null && state.retry > this.dependencies.scheduler.now())
			return Promise.resolve();
		if (state.running) return state.running;
		const running = Promise.resolve()
			.then(() => this.run(lane))
			.finally(() => {
				if (this.state.lane(lane).running !== running || this.state.stopped) return;
				this.state.updateLane(lane, { running: null });
				this.schedule();
				const latest = this.state.lane(lane);
				if (latest.requested && latest.retry === null && !this.stopped && this.online)
					void this.request(lane);
			});
		this.state.updateLane(lane, { running });
		return running;
	}
	private async run(lane: SyncLane): Promise<void> {
		do {
			this.state.updateLane(lane, { requested: false, retry: null });
			let operationFailure = false;
			try {
				if (this.stopped || !this.online) return;
				const result = await this.dependencies[lane]();
				if (this.stopped) return;
				this.state.updateLane(lane, { result });
				if (result.kind === 'failure') {
					operationFailure = lane === 'writes' && this.state.writeRetries().size > 0;
					throw new Error(result.message);
				}
				if (result.kind === 'waiting') this.deferLane(lane);
				else this.state.updateLane(lane, { failures: 0 });
				this.dependencies.failed(this.failure);
				// audit-allow: silent-catch — the typed lane failure is retained for the account, reported to its subscriber and scheduled for retry.
			} catch (error) {
				if (this.stopped) return;
				this.state.updateLane(lane, {
					result: {
						kind: 'failure',
						message: error instanceof Error ? error.message : 'Workspace synchronization failed'
					}
				});
				if (!operationFailure) this.deferLane(lane);
				this.dependencies.failed(this.failure);
				return;
			}
		} while (this.state.lane(lane).requested && !this.stopped && this.online);
	}
	private deferLane(lane: SyncLane): void {
		const failures = this.state.lane(lane).failures + 1;
		this.state.updateLane(lane, {
			failures,
			retry: this.scheduling.retryAt(failures, this.dependencies.scheduler.now())
		});
	}
	private schedule(): void {
		this.state.takeWake()?.();
		if (this.stopped || !this.online) return;
		const at = this.scheduling.wakeAt(this.lanes(), this.state.writeRetries());
		if (at === null) return;
		const wakeVersion = this.state.wakeVersion;
		this.state.setWake(
			this.dependencies.scheduler.schedule(at, async () => {
				if (this.state.stopped || this.state.wakeVersion !== wakeVersion) return;
				this.state.setWake(null);
				const due = this.scheduling.dueLanes(
					this.lanes(),
					this.state.writeRetries(),
					this.dependencies.scheduler.now()
				);
				await Promise.all(due.map((lane) => this.request(lane)));
			})
		);
	}
}
