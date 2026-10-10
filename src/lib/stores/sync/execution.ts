import type { SyncLane, SyncLaneState, SyncWriteRetry } from '$lib/models/sync';

/** One account lifetime; this store never starts work or invokes retained callbacks. */
export interface SyncExecutionStateAccess {
	readonly wakeVersion: number;
	readonly online: boolean;
	readonly stopped: boolean;
	setOnline(value: boolean): void;
	stop(): void;
	lane(name: SyncLane): SyncLaneState;
	updateLane(name: SyncLane, changes: Partial<SyncLaneState>): void;
	writeRetries(): ReadonlyMap<string, SyncWriteRetry>;
	setWriteRetry(id: string, retry: SyncWriteRetry): void;
	deleteWriteRetry(id: string): void;
	setWake(wake: (() => void) | null): void;
	takeWake(): (() => void) | null;
}
export class SyncExecutionStore implements SyncExecutionStateAccess {
	private readonly lanes: Record<SyncLane, SyncLaneState> = {
		pull: { requested: false, running: null, retry: null, failures: 0, result: { kind: 'idle' } },
		writes: { requested: false, running: null, retry: null, failures: 0, result: { kind: 'idle' } }
	};
	private readonly retries = new Map<string, SyncWriteRetry>();
	private connected = true;
	private closed = false;
	private wake: (() => void) | null = null;
	private wakeGeneration = 0;
	get wakeVersion(): number {
		return this.wakeGeneration;
	}
	get online(): boolean {
		return this.connected;
	}
	get stopped(): boolean {
		return this.closed;
	}
	setOnline(value: boolean): void {
		this.connected = value;
	}
	stop(): void {
		this.closed = true;
		this.retries.clear();
		for (const lane of ['pull', 'writes'] as const)
			this.lanes[lane] = {
				requested: false,
				running: null,
				retry: null,
				failures: 0,
				result: { kind: 'stopped' }
			};
	}
	lane(name: SyncLane): SyncLaneState {
		return this.lanes[name];
	}
	updateLane(name: SyncLane, changes: Partial<SyncLaneState>): void {
		this.lanes[name] = { ...this.lanes[name], ...changes };
	}
	writeRetries(): ReadonlyMap<string, SyncWriteRetry> {
		return this.retries;
	}
	setWriteRetry(id: string, retry: SyncWriteRetry): void {
		this.retries.set(id, retry);
	}
	deleteWriteRetry(id: string): void {
		this.retries.delete(id);
	}
	setWake(wake: (() => void) | null): void {
		this.wake = wake;
	}
	takeWake(): (() => void) | null {
		this.wakeGeneration++;
		const wake = this.wake;
		this.wake = null;
		return wake;
	}
}
