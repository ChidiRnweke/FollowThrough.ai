import type {
	ResourceState,
	SyncCursor,
	SyncEtag,
	SynchronizationResult,
	TransferState
} from '$lib/models/sync';

export interface ResourceReadAttempt {
	readonly target: SyncEtag | null;
	readonly transfer: TransferState;
}
export interface ResourceCacheSnapshot<T> {
	readonly entries: ReadonlyMap<string, ResourceState<T>>;
	readonly readGeneration: number;
	readonly initializing: Promise<void> | null;
	readonly checking: Promise<SynchronizationResult> | null;
	readonly stopped: boolean;
	readonly online: boolean;
	readonly cursor: SyncCursor | null;
	readonly inventoryComplete: boolean;
	readonly result: SynchronizationResult;
}

/** Account-scoped cache observations and pending reads, without I/O or cache decisions. */
export interface ResourceCacheStateAccess<T> {
	read(): ResourceCacheSnapshot<T>;
	update(changes: Partial<ResourceCacheSnapshot<T>>): void;
	listeners(): ReadonlySet<() => void>;
	subscribe(listener: () => void): () => void;
	fetching(key: string): Promise<SynchronizationResult> | undefined;
	setFetching(key: string, work: Promise<SynchronizationResult>): void;
	removeFetching(key: string): void;
	attempts(): ReadonlyMap<string, ResourceReadAttempt>;
	setAttempt(key: string, attempt: ResourceReadAttempt): void;
	removeAttempt(key: string): void;
	clearAttempts(): void;
}
export class ResourceCacheStore<T> implements ResourceCacheStateAccess<T> {
	private state: ResourceCacheSnapshot<T> = {
		entries: new Map(),
		readGeneration: 0,
		initializing: null,
		checking: null,
		stopped: false,
		online: true,
		cursor: null,
		inventoryComplete: false,
		result: { kind: 'idle' }
	};
	private readonly subscriptions = new Set<() => void>();
	private readonly pendingReads = new Map<string, Promise<SynchronizationResult>>();
	private readonly readAttempts = new Map<string, ResourceReadAttempt>();
	read(): ResourceCacheSnapshot<T> {
		return this.state;
	}
	update(changes: Partial<ResourceCacheSnapshot<T>>): void {
		this.state = { ...this.state, ...changes };
	}
	listeners(): ReadonlySet<() => void> {
		return this.subscriptions;
	}
	subscribe(listener: () => void): () => void {
		this.subscriptions.add(listener);
		return () => this.subscriptions.delete(listener);
	}
	fetching(key: string): Promise<SynchronizationResult> | undefined {
		return this.pendingReads.get(key);
	}
	setFetching(key: string, work: Promise<SynchronizationResult>): void {
		this.pendingReads.set(key, work);
	}
	removeFetching(key: string): void {
		this.pendingReads.delete(key);
	}
	attempts(): ReadonlyMap<string, ResourceReadAttempt> {
		return this.readAttempts;
	}
	setAttempt(key: string, attempt: ResourceReadAttempt): void {
		this.readAttempts.set(key, attempt);
	}
	removeAttempt(key: string): void {
		this.readAttempts.delete(key);
	}
	clearAttempts(): void {
		this.readAttempts.clear();
	}
}
