import {
	accessCache,
	receiveResource,
	resourceVersion,
	type ResourceDeletion,
	initialSyncCursor,
	type SyncCursor,
	type SyncEtag,
	type ResourceState,
	resourceCurrent,
	type CacheAccess,
	type TransferState,
	type SyncSnapshot
} from '$lib/models/sync';
import type {
	CacheCommit,
	StoredCache,
	SyncCacheRepository,
	SyncReadTransport,
	SynchronizationResult
} from './contracts';

export interface ResourceCacheDependencies<T> {
	repository: SyncCacheRepository<T>;
	transport: SyncReadTransport<T>;
}

/** One account and one loading path. Durable writes precede notifications to readers. */
export class ResourceCache<T> {
	private entries = new Map<string, ResourceState<T>>();
	private readonly listeners = new Set<() => void>();
	private readonly fetching = new Map<string, Promise<SynchronizationResult>>();
	private readonly attempts = new Map<
		string,
		{ target: SyncEtag | null; transfer: TransferState }
	>();
	private readGeneration = 0;
	private initializing: Promise<void> | null = null;
	private checking: Promise<SynchronizationResult> | null = null;
	private stopped = false;
	private online = true;
	private cursor: SyncCursor | null = null;
	private inventoryComplete = false;
	private result: SynchronizationResult = { kind: 'idle' };

	constructor(
		readonly accountId: string,
		private readonly dependencies: ResourceCacheDependencies<T>
	) {}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get status(): SynchronizationResult {
		return this.result;
	}
	get downloadProgress(): { completed: number; total: number; inventoryComplete: boolean } {
		const present = [...this.entries.values()].filter((entry) => entry.kind !== 'deleted');
		return {
			completed: present.filter(resourceCurrent).length,
			total: present.length,
			inventoryComplete: this.inventoryComplete
		};
	}
	get failedDownloads(): number {
		return [...this.attempts.values()].filter((attempt) => attempt.transfer.kind === 'failed')
			.length;
	}
	get records(): ReadonlyMap<string, ResourceState<T>> {
		return this.entries;
	}

	get availability(): 'unknown' | 'complete' {
		return this.cursor !== null && this.inventoryComplete && !this.stopped ? 'complete' : 'unknown';
	}

	access(key: string): CacheAccess<T> {
		if (this.stopped) return { kind: 'unavailable' };
		return accessCache(this.entry(key), this.online, this.transfer(key));
	}

	setOnline(online: boolean): void {
		this.online = online;
		this.notify();
	}

	stop(): void {
		this.stopped = true;
		this.attempts.clear();
		this.entries.clear();
		this.result = { kind: 'stopped' };
		this.notify();
	}

	initialize(): Promise<void> {
		this.initializing ??= this.restore().catch((error) => {
			this.initializing = null;
			throw error;
		});
		return this.initializing;
	}

	/** Incorporate another tab's durable records without replacing newer local knowledge. */
	async reload(): Promise<void> {
		await this.initialize();
		await this.restore();
	}

	refresh(): Promise<SynchronizationResult> {
		if (!this.checking)
			this.checking = this.pullChanges().finally(() => {
				this.checking = null;
			});
		return this.checking;
	}

	async open(key: string): Promise<CacheAccess<T>> {
		try {
			await this.initialize();
			const current = this.access(key);
			if (current.kind === 'ready' || current.kind === 'deleted' || !this.online || this.stopped)
				return current;
			const result = await this.waitForRead(key);
			if (result.kind === 'failure' || result.kind === 'unavailable') return result;
			const after = this.access(key);
			return after.kind === 'wait' ? this.open(key) : after;
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Local storage failed'
			};
		}
	}

	/** Mutation receipts feed the same cache; an older change batch cannot undo an accepted write. */
	async accept(key: string, received: SyncSnapshot<T> | ResourceDeletion): Promise<void> {
		await this.initialize();
		if (this.stopped) return;
		await this.commit(() => ({
			put: [{ key, entry: receiveResource(undefined, received) }],
			remove: []
		}));
	}

	private entry(key: string): ResourceState<T> | undefined {
		return this.entries.get(key);
	}
	private transfer(key: string): TransferState | undefined {
		const attempt = this.attempts.get(key);
		return !resourceCurrent(this.entry(key)) &&
			this.entry(key)?.kind !== 'deleted' &&
			attempt?.target === resourceVersion(this.entry(key))
			? attempt?.transfer
			: undefined;
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private async restore(): Promise<void> {
		const generation = ++this.readGeneration;
		const stored = await this.dependencies.repository.load(this.accountId);
		if (generation === this.readGeneration) this.applyStored(stored);
	}

	/** One authoritative snapshot; live attempts never alter durable resource knowledge. */
	applyStored({ records, cursor, inventoryComplete }: StoredCache<T>, notify = true): void {
		if (this.stopped) return;
		this.readGeneration++;
		this.initializing ??= Promise.resolve();
		this.cursor = cursor;
		this.inventoryComplete = inventoryComplete;
		this.entries = new Map(records.map(({ key, entry }) => [key, entry]));
		for (const key of this.attempts.keys()) if (!this.transfer(key)) this.attempts.delete(key);
		if (notify) this.notify();
	}

	private async commit(compute: () => CacheCommit<T>): Promise<void> {
		if (this.stopped) return;
		await this.dependencies.repository.commit(this.accountId, {
			...compute()
		});
		await this.restore();
	}

	private async pullChanges(): Promise<SynchronizationResult> {
		try {
			await this.reload();
			if (this.stopped) return { kind: 'stopped' };
			if (!this.online) return { kind: 'offline' };
			let more: boolean;
			do {
				const before = this.cursor ?? initialSyncCursor;
				const batch = await this.dependencies.transport.pull(before);
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				await this.commit(() => {
					if (BigInt(batch.cursor) < BigInt(this.cursor ?? initialSyncCursor))
						throw new Error('The server change cursor moved backwards');
					const put = batch.records.map(({ key, resource }) => ({
						key,
						entry: receiveResource<T>(
							undefined,
							resource.kind === 'found' ? resource.snapshot : resource
						)
					}));
					return {
						put,
						remove: [],
						cursor: batch.cursor,
						inventoryComplete: this.inventoryComplete || !more
					};
				});
				if (!this.online) return { kind: 'offline' };
			} while (more && !this.stopped);
			if (this.stopped) return { kind: 'stopped' };
			this.result = { kind: 'complete' };
			this.notify();
			return this.result;
		} catch (error) {
			if (this.stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Change synchronization failed';
			this.result = { kind: 'failure', message };
			this.notify();
			return { kind: 'failure', message };
		}
	}

	private fetch(key: string): Promise<SynchronizationResult> {
		const existing = this.fetching.get(key);
		if (existing) return existing;
		const request = this.read(key).finally(() => this.fetching.delete(key));
		this.fetching.set(key, request);
		return request;
	}

	private async waitForRead(key: string): Promise<SynchronizationResult> {
		const interrupted = Promise.withResolvers<SynchronizationResult>();
		const unsubscribe = this.subscribe(() => {
			if (this.stopped) interrupted.resolve({ kind: 'stopped' });
			else if (!this.online) interrupted.resolve({ kind: 'offline' });
		});
		try {
			return await Promise.race([this.fetch(key), interrupted.promise]);
		} finally {
			unsubscribe();
		}
	}

	private async read(key: string): Promise<SynchronizationResult> {
		try {
			const response = await this.dependencies.transport.read(key, null);
			if (this.stopped) return { kind: 'stopped' };
			if (response.kind === 'unchanged') throw new Error('An uncached read returned no body');
			if (response.kind === 'unavailable') return { kind: 'unavailable' };
			await this.commit(() => ({
				put: [
					{
						key,
						entry: receiveResource<T>(
							undefined,
							response.kind === 'found' ? response.snapshot : response
						)
					}
				],
				remove: []
			}));
			this.attempts.delete(key);
			return { kind: 'complete' };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'The resource could not be downloaded';
			this.attempts.set(key, {
				target: resourceVersion(this.entry(key)),
				transfer: { kind: 'failed', message }
			});
			this.notify();
			return { kind: 'failure', message };
		}
	}
}
