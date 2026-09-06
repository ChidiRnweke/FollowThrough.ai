import {
	accessCache,
	cachedSnapshot,
	receiveResource,
	mergeResourceStates,
	resourceVersion,
	type ResourceDeletion,
	applyResourceChanges,
	initialSyncCursor,
	type SyncCursor,
	type ResourceState,
	transitionCache,
	type CacheAccess,
	type CacheEntry,
	type SyncSnapshot
} from '$lib/models/sync';
import type {
	CacheCommit,
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
	private readonly queue = new Set<string>();
	private initializing: Promise<void> | null = null;
	private checking: Promise<SynchronizationResult> | null = null;
	private draining: Promise<SynchronizationResult> | null = null;
	private stopped = false;
	private online = true;
	private cursor: SyncCursor | null = null;
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
	get records(): ReadonlyMap<string, ResourceState<T>> {
		return this.entries;
	}

	get availability(): 'unknown' | 'partial' | 'complete' {
		if (this.cursor === null || this.stopped) return 'unknown';
		return [...this.entries.values()].every(
			(entry) => entry.kind === 'deleted' || cachedSnapshot(entry.cache) !== null
		)
			? 'complete'
			: 'partial';
	}

	access(key: string): CacheAccess<T> {
		if (this.stopped) return { kind: 'unavailable' };
		return this.entries.get(key)?.kind === 'deleted'
			? { kind: 'deleted' }
			: accessCache(this.entry(key), this.online);
	}

	setOnline(online: boolean): void {
		this.online = online;
		this.notify();
	}

	stop(): void {
		this.stopped = true;
		this.queue.clear();
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

	refresh(): Promise<SynchronizationResult> {
		if (!this.checking)
			this.checking = this.pullChanges().finally(() => {
				this.checking = null;
			});
		return this.checking;
	}

	/** Warming is independent of route rendering; foreground reads bypass this serial lane. */
	warm(): Promise<SynchronizationResult> {
		if (!this.draining)
			this.draining = this.drain().finally(() => {
				this.draining = null;
			});
		return this.draining;
	}

	async open(key: string): Promise<CacheAccess<T>> {
		try {
			await this.initialize();
			const current = this.access(key);
			if (current.kind === 'ready' || current.kind === 'deleted' || !this.online || this.stopped)
				return current;
			this.queue.delete(key);
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
		await this.commit(() => ({ put: [{ key, entry: this.receive(key, received) }], remove: [] }));
	}

	private receive(key: string, received: SyncSnapshot<T> | ResourceDeletion): ResourceState<T> {
		return receiveResource(
			this.entries.get(key) ?? { kind: 'present', cache: { kind: 'uncached' } },
			received
		);
	}

	private entry(key: string): CacheEntry<T> {
		const resource = this.entries.get(key);
		return resource?.kind === 'present' ? resource.cache : { kind: 'uncached' };
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private async restore(): Promise<void> {
		const { records, cursor } = await this.dependencies.repository.load(this.accountId);
		if (this.stopped) return;
		this.cursor = cursor;
		for (const { key, entry } of records) {
			this.entries.set(
				key,
				entry.kind === 'present' && entry.cache.kind === 'updating'
					? { kind: 'present', cache: { ...entry.cache, transfer: { kind: 'queued' } } }
					: entry
			);
			if (entry.kind === 'present' && entry.cache.kind === 'updating') this.queue.add(key);
		}
		this.notify();
	}

	private async commit(compute: () => CacheCommit<T>): Promise<void> {
		if (this.stopped) return;
		const changes = await this.dependencies.repository.commit(this.accountId, compute());
		if (this.stopped) return;
		for (const record of changes.put) {
			const current = this.entries.get(record.key);
			this.entries.set(
				record.key,
				current ? mergeResourceStates(current, record.entry) : record.entry
			);
		}
		for (const removal of changes.remove) {
			const current = this.entries.get(removal.key);
			if (!current || resourceVersion(current) === removal.etag) {
				this.entries.delete(removal.key);
				this.queue.delete(removal.key);
			}
		}
		if (changes.cursor !== undefined) this.cursor = changes.cursor;
		this.notify();
	}

	private async pullChanges(): Promise<SynchronizationResult> {
		try {
			await this.initialize();
			if (this.stopped) return { kind: 'stopped' };
			if (!this.online) return { kind: 'offline' };
			const batch = await this.dependencies.transport.pull(this.cursor ?? initialSyncCursor);
			await this.commit(() => {
				if (BigInt(batch.cursor) < BigInt(this.cursor ?? initialSyncCursor))
					throw new Error('The server change cursor moved backwards');
				const next = applyResourceChanges(this.entries, batch.changes);
				return {
					put: [...next]
						.filter(([key, entry]) => entry !== this.entries.get(key))
						.map(([key, entry]) => ({ key, entry })),
					remove: [],
					cursor: batch.cursor
				};
			});
			if (this.stopped) return { kind: 'stopped' };
			for (const [key, entry] of this.entries) {
				if (entry.kind === 'present' && entry.cache.kind === 'updating') this.queue.add(key);
				else this.queue.delete(key);
			}
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
		const pending = this.download(key).finally(() => {
			this.fetching.delete(key);
		});
		this.fetching.set(key, pending);
		return pending;
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

	private async download(key: string): Promise<SynchronizationResult> {
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		try {
			await this.commit(() =>
				this.entries.get(key)?.kind === 'deleted'
					? { put: [], remove: [] }
					: {
							put: [
								{
									key,
									entry: {
										kind: 'present',
										cache: transitionCache(this.entry(key), { kind: 'request' })
									}
								}
							],
							remove: []
						}
			);
			if (this.stopped) return { kind: 'stopped' };
			if (this.entries.get(key)?.kind === 'deleted') return { kind: 'complete' };
			if (this.entry(key).kind === 'cached') return { kind: 'complete' };
			const snapshot = cachedSnapshot(this.entry(key));
			const expected = resourceVersion(
				this.entries.get(key) ?? { kind: 'present', cache: { kind: 'uncached' } }
			);
			const response = await this.dependencies.transport.read(key, snapshot?.etag ?? null);
			if (this.stopped) return { kind: 'stopped' };
			if (response.kind === 'deleted') {
				await this.commit(() => ({
					put: [{ key, entry: this.receive(key, response) }],
					remove: []
				}));
				return { kind: 'complete' };
			}
			if (response.kind === 'unavailable') {
				await this.commit(() => ({ put: [], remove: [{ key, etag: expected }] }));
				const current = this.entries.get(key);
				return current && resourceVersion(current) !== expected
					? { kind: 'complete' }
					: { kind: 'unavailable' };
			}
			if (response.kind === 'unchanged' && (!snapshot || snapshot.etag !== response.etag))
				throw new Error('The server confirmed a version this device does not have');
			const received = response.kind === 'found' ? response.snapshot : snapshot;
			if (!received) throw new Error('The object response contains no usable version');
			await this.commit(() => ({
				put: [
					{
						key,
						entry: this.receive(key, received)
					}
				],
				remove: []
			}));
			if (this.entry(key).kind === 'updating') this.queue.add(key);
			return { kind: 'complete' };
		} catch (error) {
			if (this.stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Object download failed';
			// Preserve the last durable copy even if persisting the failure itself is unavailable.
			if (!this.stopped && this.entries.get(key)?.kind !== 'deleted')
				this.entries.set(key, {
					kind: 'present',
					cache: transitionCache(this.entry(key), { kind: 'failure', message })
				});
			this.result = { kind: 'failure', message };
			this.notify();
			return { kind: 'failure', message };
		}
	}

	private async drain(): Promise<SynchronizationResult> {
		while (this.queue.size && this.online && !this.stopped) {
			const key = this.queue.values().next().value;
			if (!key) break;
			this.queue.delete(key);
			if (this.entries.get(key)?.kind === 'deleted' || this.entry(key).kind === 'cached') continue;
			await this.fetch(key);
		}
		return this.stopped ? { kind: 'stopped' } : !this.online ? { kind: 'offline' } : this.result;
	}
}
