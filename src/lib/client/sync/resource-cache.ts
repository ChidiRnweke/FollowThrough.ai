import {
	accessCache,
	initialCacheGeneration,
	cachedSnapshot,
	receiveResource,
	resourceVersion,
	type ResourceDeletion,
	applyResourceChanges,
	initialSyncCursor,
	type SyncCursor,
	type SyncEtag,
	type ResourceState,
	resourceCurrent,
	syncBodyBatchSize,
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
	private readingBodies = 0;
	private readonly capacityWaiters = new Set<() => void>();
	private readonly stalled = new Map<string, { target: SyncEtag | null; attempts: number }>();
	private readGeneration = 0;
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
		const present = [...this.entries.values()].filter((entry) => entry.kind !== 'deleted');
		return {
			completed: present.filter(resourceCurrent).length,
			total: present.length,
			inventoryComplete: this.inventoryComplete
		};
	}
	get failedDownloads(): number {
		return [...this.entries.keys()].filter((key) => this.transfer(key)?.kind === 'failed').length;
	}
	get records(): ReadonlyMap<string, ResourceState<T>> {
		return this.entries;
	}

	get availability(): 'unknown' | 'partial' | 'complete' {
		if (this.cursor === null || !this.inventoryComplete || this.stopped) return 'unknown';
		return [...this.entries.values()].every(
			(entry) => entry.kind === 'deleted' || cachedSnapshot(entry) !== null
		)
			? 'complete'
			: 'partial';
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
		this.stalled.clear();
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
			await Promise.all([this.downloadBatch(missing), ...joined]);
		}
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
	applyStored(
		{ records, cursor, generation, inventoryComplete }: StoredCache<T>,
		notify = true
	): void {
		if (this.stopped) return;
		this.readGeneration++;
		this.initializing ??= Promise.resolve();
		if (generation !== this.generation) {
			this.attempts.clear();
			this.stalled.clear();
		}
		this.generation = generation;
		this.cursor = cursor;
		this.inventoryComplete = inventoryComplete;
		this.entries = new Map(records.map(({ key, entry }) => [key, entry]));
		for (const key of this.attempts.keys()) if (!this.transfer(key)) this.attempts.delete(key);
		if (notify) this.notify();
	}

	private async commit(compute: () => CacheCommit<T>, generation = this.generation): Promise<void> {
		if (this.stopped) return;
		await this.dependencies.repository.commit(this.accountId, {
			...compute(),
			generation
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
				const generation = this.generation;
				const batch = await this.dependencies.transport.pull(before);
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				await this.commit(() => {
					if (BigInt(batch.cursor) < BigInt(this.cursor ?? initialSyncCursor))
						throw new Error('The server change cursor moved backwards');
					const next = applyResourceChanges<T>(new Map(), batch.changes);
					return {
						put: [...next].map(([key, entry]) => ({ key, entry })),
						remove: [],
						cursor: batch.cursor,
						inventoryComplete: this.inventoryComplete || !more
					};
				}, generation);
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
		if (!current || current.kind === 'deleted' || resourceCurrent(current)) {
			this.stalled.delete(key);
			return { kind: 'complete' };
		}
		const target = resourceVersion(current);
		const previous = this.stalled.get(key);
		const attempts =
			target !== requested ? 0 : previous?.target === target ? previous.attempts + 1 : 1;
		if (attempts < 2) {
			this.stalled.set(key, { target, attempts });
			return { kind: 'complete' };
		}
		const message = 'The latest copy could not be downloaded. Retry to check again.';
		this.stalled.delete(key);
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
			const missing = keys.filter((key) => !this.entries.has(key));
			if (missing.length)
				await this.commit(() => ({
					put: missing.map((key) => ({ key, entry: { kind: 'requested' } })),
					remove: []
				}));
			for (const key of keys) {
				if (this.entry(key)?.kind === 'deleted' || resourceCurrent(this.entry(key))) {
					results.set(key, { kind: 'complete' });
					continue;
				}
				this.attempts.set(key, {
					target: resourceVersion(this.entry(key)),
					transfer: { kind: 'fetching' }
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
			const versions = new Map(keys.map((key) => [key, resourceVersion(this.entry(key))]));
			const generation = this.generation;
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
						put.push({ key, entry: receiveResource(undefined, received) });
						results.set(key, { kind: 'complete' });
					}
				}
				return { put, remove };
			}, generation);
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
		this.stalled.delete(key);
		if (this.stopped || this.entry(key)?.kind === 'deleted') return;
		this.attempts.set(key, {
			target: resourceVersion(this.entry(key)),
			transfer: { kind: 'failed', message }
		});
	}

	private async drain(): Promise<SynchronizationResult> {
		const attempted = new Map<string, SyncEtag | null>();
		while (this.online && !this.stopped) {
			const keys = [...this.entries]
				.filter(
					([key, entry]) =>
						entry.kind !== 'deleted' &&
						!resourceCurrent(entry) &&
						!this.fetching.has(key) &&
						(!attempted.has(key) ||
							attempted.get(key) !== resourceVersion(entry) ||
							this.stalled.has(key))
				)
				.slice(0, syncBodyBatchSize)
				.map(([key]) => key);
			if (!keys.length) break;
			for (const key of keys) attempted.set(key, resourceVersion(this.entry(key)));
			await this.downloadBatch(keys);
		}
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		for (const key of this.entries.keys()) {
			const transfer = this.transfer(key);
			if (transfer?.kind === 'failed') return { kind: 'failure', message: transfer.message };
		}
		return { kind: 'complete' };
	}
}
