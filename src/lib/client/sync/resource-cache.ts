import {
	accessCache,
	initialCacheGeneration,
	cachedSnapshot,
	receiveResource,
	mergeResourceStates,
	resourceVersion,
	type ResourceDeletion,
	applyResourceChanges,
	initialSyncCursor,
	type SyncCursor,
	type SyncEtag,
	type ResourceState,
	transitionCache,
	syncBodyBatchSize,
	type CacheAccess,
	type CacheEntry,
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
	private readonly queue = new Set<string>();
	private readingBodies = 0;
	private readonly capacityWaiters = new Set<() => void>();
	private readonly stalled = new Map<string, { target: SyncEtag | null; attempts: number }>();
	private initializing: Promise<void> | null = null;
	private checking: Promise<SynchronizationResult> | null = null;
	private draining: Promise<SynchronizationResult> | null = null;
	private stopped = false;
	private online = true;
	private cursor: SyncCursor | null = null;
	private generation: string = initialCacheGeneration;
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
		const present = [...this.entries.values()].filter((entry) => entry.kind === 'present');
		return {
			completed: present.filter(
				(entry) => entry.kind === 'present' && entry.cache.kind === 'cached'
			).length,
			total: present.length,
			inventoryComplete: this.inventoryComplete
		};
	}
	get failedDownloads(): number {
		return [...this.entries.values()].filter(
			(entry) =>
				entry.kind === 'present' &&
				entry.cache.kind === 'updating' &&
				entry.cache.transfer.kind === 'failed'
		).length;
	}
	get records(): ReadonlyMap<string, ResourceState<T>> {
		return this.entries;
	}

	get availability(): 'unknown' | 'partial' | 'complete' {
		if (this.cursor === null || !this.inventoryComplete || this.stopped) return 'unknown';
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

	/** Warming is independent of route rendering; foreground reads bypass this serial lane. */
	warm(): Promise<SynchronizationResult> {
		if (!this.draining)
			this.draining = this.drain().finally(() => {
				this.draining = null;
			});
		return this.draining;
	}

	/** Prepare collection bodies through the same bounded transfer path as warming. */
	async prepare(keys: readonly string[]): Promise<void> {
		await this.initialize();
		if (!this.online || this.stopped) return;
		for (
			let offset = 0;
			offset < keys.length && this.online && !this.stopped;
			offset += syncBodyBatchSize
		) {
			const batch = keys.slice(offset, offset + syncBodyBatchSize);
			const joined = batch.flatMap((key) => {
				const active = this.fetching.get(key);
				return active ? [active] : [];
			});
			const missing = batch.filter(
				(key) =>
					!this.fetching.has(key) &&
					cachedSnapshot(this.entry(key)) === null &&
					this.entries.get(key)?.kind !== 'deleted'
			);
			for (const key of missing) this.queue.delete(key);
			await Promise.all([this.downloadBatch(missing), ...joined]);
		}
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
		this.applyStored(await this.dependencies.repository.load(this.accountId));
	}

	/** Apply one coherent durable projection; the caller may publish it with other workspace state. */
	applyStored(
		{ records, cursor, generation, inventoryComplete }: StoredCache<T>,
		notify = true
	): void {
		if (this.stopped) return;
		if (generation !== this.generation) {
			this.generation = generation;
			this.cursor = null;
			this.inventoryComplete = false;
			this.entries.clear();
			this.queue.clear();
		}
		if (cursor !== null && (this.cursor === null || BigInt(cursor) > BigInt(this.cursor)))
			this.cursor = cursor;
		this.inventoryComplete ||= inventoryComplete;
		for (const { key, entry } of records) {
			const restored: ResourceState<T> =
				entry.kind === 'present' && entry.cache.kind === 'updating'
					? { kind: 'present', cache: { ...entry.cache, transfer: { kind: 'queued' } } }
					: entry;
			const current = this.entries.get(key);
			let merged = current ? mergeResourceStates(current, restored) : restored;
			if (
				current?.kind === 'present' &&
				current.cache.kind === 'updating' &&
				merged.kind === 'present' &&
				merged.cache.kind === 'updating' &&
				current.cache.target === merged.cache.target
			)
				merged = { kind: 'present', cache: { ...merged.cache, transfer: current.cache.transfer } };
			this.entries.set(key, merged);
			if (merged.kind === 'present' && merged.cache.kind === 'updating') this.queue.add(key);
			else this.queue.delete(key);
		}
		if (notify) this.notify();
	}

	private async commit(compute: () => CacheCommit<T>): Promise<void> {
		if (this.stopped) return;
		const proposed = compute();
		const changes = await this.dependencies.repository.commit(this.accountId, {
			...proposed,
			put: proposed.put.map(({ key, entry }) => ({
				key,
				entry:
					entry.kind === 'present' && entry.cache.kind === 'updating'
						? { kind: 'present', cache: { ...entry.cache, transfer: { kind: 'queued' } } }
						: entry
			})),
			generation: this.generation
		});
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
		if (changes.inventoryComplete !== undefined) this.inventoryComplete = changes.inventoryComplete;
		this.notify();
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
					const next = applyResourceChanges(this.entries, batch.changes);
					return {
						put: [...next]
							.filter(([key, entry]) => entry !== this.entries.get(key))
							.map(([key, entry]) => ({ key, entry })),
						remove: [],
						cursor: batch.cursor,
						inventoryComplete: this.inventoryComplete || !more
					};
				});
				if (!this.online) return { kind: 'offline' };
			} while (more && !this.stopped);
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
		void this.downloadBatch([key]);
		return this.fetching.get(key)!;
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

	private async withBodyCapacity<R>(count: number, work: () => Promise<R>): Promise<R> {
		while (this.readingBodies + count > syncBodyBatchSize)
			await new Promise<void>((resolve) => this.capacityWaiters.add(resolve));
		if (this.stopped || !this.online) throw new Error('The workspace download is no longer active');
		this.readingBodies += count;
		try {
			return await work();
		} finally {
			this.readingBodies -= count;
			const waiting = [...this.capacityWaiters];
			this.capacityWaiters.clear();
			for (const wake of waiting) wake();
		}
	}
	private async finishRead(
		key: string,
		requested: SyncEtag | null
	): Promise<SynchronizationResult> {
		const current = this.entries.get(key);
		if (!current || current.kind !== 'present' || current.cache.kind !== 'updating') {
			this.stalled.delete(key);
			return { kind: 'complete' };
		}
		const target = resourceVersion(current);
		const previous = this.stalled.get(key);
		const attempts =
			target !== requested ? 0 : previous?.target === target ? previous.attempts + 1 : 1;
		if (attempts < 2) {
			this.stalled.set(key, { target, attempts });
			this.queue.add(key);
			return { kind: 'complete' };
		}
		const message = 'The latest copy could not be downloaded. Retry to check again.';
		this.stalled.delete(key);
		this.queue.delete(key);
		this.failDownload(key, message);
		this.notify();
		return { kind: 'failure', message };
	}

	private async downloadBatch(keys: readonly string[]): Promise<void> {
		if (!keys.length) return;
		const existing = keys.flatMap((key) => {
			const pending = this.fetching.get(key);
			return pending ? [pending] : [];
		});
		keys = [...new Set(keys)].filter((key) => !this.fetching.has(key));
		const batch = Promise.resolve().then(() => this.performBatch(keys));
		await Promise.all([
			...existing,
			...keys.map((key) => {
				const pending = batch
					.then(({ results }) => results.get(key) ?? { kind: 'stopped' as const })
					.finally(() => this.fetching.delete(key));
				this.fetching.set(key, pending);
				return pending;
			})
		]);
	}

	private async performBatch(keys: readonly string[]): Promise<{
		kind: 'complete' | 'failure';
		results: ReadonlyMap<string, SynchronizationResult>;
	}> {
		const results = new Map<string, SynchronizationResult>();
		try {
			const missing = keys.filter(
				(key) => this.entry(key).kind === 'uncached' && this.entries.get(key)?.kind !== 'deleted'
			);
			if (missing.length)
				await this.commit(() => ({
					put: missing.map((key) => ({
						key,
						entry: {
							kind: 'present',
							cache: {
								kind: 'updating',
								previous: null,
								target: null,
								transfer: { kind: 'queued' }
							}
						}
					})),
					remove: []
				}));
			for (const key of keys) {
				if (this.entries.get(key)?.kind === 'deleted' || this.entry(key).kind === 'cached') {
					results.set(key, { kind: 'complete' });
					continue;
				}
				this.entries.set(key, {
					kind: 'present',
					cache: transitionCache(this.entry(key), { kind: 'request' })
				});
			}
			keys = keys.filter((key) => !results.has(key));
			this.notify();
			if (!keys.length) return { kind: 'complete', results };
			if (this.stopped || !this.online)
				return {
					kind: 'complete',
					results: new Map(keys.map((key) => [key, { kind: this.stopped ? 'stopped' : 'offline' }]))
				};
			const snapshots = new Map(keys.map((key) => [key, cachedSnapshot(this.entry(key))]));
			const versions = new Map(
				keys.map((key) => [
					key,
					this.entries.has(key) ? resourceVersion(this.entries.get(key)!) : null
				])
			);
			const rows = await this.withBodyCapacity(keys.length, () =>
				this.dependencies.transport.readMany(
					keys.map((key) => ({ key, etag: snapshots.get(key)?.etag ?? null }))
				)
			);
			if (this.stopped) return { kind: 'complete', results };
			await this.commit(() => {
				const put: CacheCommit<T>['put'][number][] = [];
				const remove: CacheCommit<T>['remove'][number][] = [];
				for (const key of keys) {
					const matches = rows.filter((row) => row.key === key);
					const response =
						matches.length === 1
							? matches[0].result
							: {
									kind: 'failure' as const,
									message: 'The batch did not return exactly one result for this item'
								};
					const snapshot = snapshots.get(key);
					const failure =
						response.kind === 'failure'
							? response.message
							: response.kind === 'unchanged' && (!snapshot || snapshot.etag !== response.etag)
								? 'The server confirmed a version this device does not have'
								: null;
					if (failure) {
						results.set(key, { kind: 'failure', message: failure });
					} else if (response.kind === 'unavailable') {
						remove.push({ key, etag: versions.get(key) ?? null });
						results.set(key, { kind: 'unavailable' });
					} else {
						const received =
							response.kind === 'found'
								? response.snapshot
								: response.kind === 'deleted'
									? response
									: snapshot;
						if (!received) throw new Error('The batch contained no usable body');
						put.push({ key, entry: this.receive(key, received) });
						results.set(key, { kind: 'complete' });
					}
				}
				return { put, remove };
			});
			for (const key of keys) {
				const result = results.get(key);
				if (result?.kind === 'complete')
					results.set(key, await this.finishRead(key, versions.get(key) ?? null));
				else if (result?.kind === 'failure') this.failDownload(key, result.message);
				else if (result?.kind === 'unavailable') {
					const current = this.entries.get(key);
					if (current && resourceVersion(current) !== versions.get(key))
						results.set(key, { kind: 'complete' });
				}
			}
			this.notify();
			return { kind: 'complete', results };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Object batch download failed';
			for (const key of keys) {
				this.failDownload(key, message);
				results.set(key, this.stopped ? { kind: 'stopped' } : { kind: 'failure', message });
			}
			this.notify();
			// The public per-resource result is consumed by foreground readers and the indicator.
			return { kind: 'failure', results };
		}
	}

	private failDownload(key: string, message: string): void {
		if (this.stopped || this.entries.get(key)?.kind === 'deleted') return;
		this.entries.set(key, {
			kind: 'present',
			cache: transitionCache(this.entry(key), { kind: 'failure', message })
		});
	}

	private async drain(): Promise<SynchronizationResult> {
		for (const [key, entry] of this.entries)
			if (entry.kind === 'present' && entry.cache.kind === 'updating' && !this.fetching.has(key))
				this.queue.add(key);
		while (this.queue.size && this.online && !this.stopped) {
			const keys: string[] = [];
			for (const key of this.queue) {
				this.queue.delete(key);
				if (
					!this.fetching.has(key) &&
					this.entries.get(key)?.kind !== 'deleted' &&
					this.entry(key).kind !== 'cached'
				)
					keys.push(key);
				if (keys.length === syncBodyBatchSize) break;
			}
			await this.downloadBatch(keys);
		}
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		for (const entry of this.entries.values())
			if (
				entry.kind === 'present' &&
				entry.cache.kind === 'updating' &&
				entry.cache.transfer.kind === 'failed'
			)
				return { kind: 'failure', message: entry.cache.transfer.message };
		return { kind: 'complete' };
	}
}
