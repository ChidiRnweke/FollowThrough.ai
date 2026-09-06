import {
	accessCache,
	cachedSnapshot,
	reconcileInventory,
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

export interface SyncReadDependencies<T> {
	repository: SyncCacheRepository<T>;
	transport: SyncReadTransport<T>;
}

/** One account and one loading path. Durable writes precede notifications to readers. */
export class SyncReadCoordinator<T> {
	private entries = new Map<string, CacheEntry<T>>();
	private readonly listeners = new Set<() => void>();
	private readonly fetching = new Map<string, Promise<SynchronizationResult>>();
	private readonly queue = new Set<string>();
	private initializing: Promise<void> | null = null;
	private checking: Promise<SynchronizationResult> | null = null;
	private draining: Promise<SynchronizationResult> | null = null;
	private committing: Promise<void | { kind: 'failure' }> = Promise.resolve();
	private epoch = 0;
	private stopped = false;
	private online = true;
	private inventoryKnown = false;
	private result: SynchronizationResult = { kind: 'idle' };

	constructor(
		readonly accountId: string,
		private readonly dependencies: SyncReadDependencies<T>
	) {}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get status(): SynchronizationResult {
		return this.result;
	}
	get records(): ReadonlyMap<string, CacheEntry<T>> {
		return this.entries;
	}

	get availability(): 'unknown' | 'partial' | 'complete' {
		if (!this.inventoryKnown || this.stopped) return 'unknown';
		return [...this.entries.values()].every((entry) => cachedSnapshot(entry) !== null)
			? 'complete'
			: 'partial';
	}

	access(key: string): CacheAccess<T> {
		return this.stopped ? { kind: 'unavailable' } : accessCache(this.entry(key), this.online);
	}

	setOnline(online: boolean): void {
		this.online = online;
		this.notify();
	}

	stop(): void {
		this.stopped = true;
		this.epoch += 1;
		this.queue.clear();
		this.entries.clear();
		this.result = { kind: 'stopped' };
		this.notify();
	}

	initialize(): Promise<void> {
		this.initializing ??= this.restore();
		return this.initializing;
	}

	refresh(): Promise<SynchronizationResult> {
		if (!this.checking)
			this.checking = this.checkInventory().finally(() => {
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
			if (current.kind === 'ready' || !this.online || this.stopped) return current;
			this.queue.delete(key);
			const result = await this.fetch(key);
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

	/** Mutation receipts feed the same cache; an older inventory cannot undo an accepted write. */
	async accept(key: string, snapshot: SyncSnapshot<T> | null): Promise<void> {
		await this.initialize();
		if (this.stopped) return;
		this.epoch += 1;
		await this.commit(() =>
			snapshot
				? {
						put: [{ key, entry: transitionCache(this.entry(key), { kind: 'receive', snapshot }) }],
						remove: []
					}
				: { put: [], remove: [key] }
		);
	}

	private entry(key: string): CacheEntry<T> {
		return this.entries.get(key) ?? { kind: 'uncached' };
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private async restore(): Promise<void> {
		const { records, inventory } = await this.dependencies.repository.load(this.accountId);
		if (this.stopped) return;
		this.inventoryKnown = inventory !== null;
		for (const { key, entry } of records) {
			this.entries.set(
				key,
				entry.kind === 'updating' ? { ...entry, transfer: { kind: 'queued' } } : entry
			);
			if (entry.kind === 'updating') this.queue.add(key);
		}
		this.notify();
	}

	private async commit(compute: () => CacheCommit<T>): Promise<void> {
		const work = this.committing.then(async () => {
			if (this.stopped) return;
			const changes = compute();
			await this.dependencies.repository.commit(this.accountId, changes);
			if (this.stopped) return;
			for (const record of changes.put) this.entries.set(record.key, record.entry);
			for (const key of changes.remove) {
				this.entries.delete(key);
				this.queue.delete(key);
			}
			if (changes.inventory) this.inventoryKnown = true;
			this.notify();
		});
		// The caller receives the rejection. Later operations can still attempt durable storage.
		this.committing = work.then(
			() => {},
			() => {
				return { kind: 'failure' };
			}
		);
		await work;
	}

	private async checkInventory(): Promise<SynchronizationResult> {
		try {
			await this.initialize();
			if (this.stopped) return { kind: 'stopped' };
			if (!this.online) return { kind: 'offline' };
			const epoch = this.epoch;
			const inventory = await this.dependencies.transport.inventory();
			if (this.stopped) return { kind: 'stopped' };
			if (epoch !== this.epoch) return this.checkInventory();
			const changes = reconcileInventory(this.entries, inventory);
			if (changes.removed.length) this.epoch += 1;
			await this.commit(() => ({
				put: [...changes.entries]
					.filter(([key, entry]) => entry !== this.entries.get(key))
					.map(([key, entry]) => ({ key, entry })),
				remove: changes.removed,
				inventory
			}));
			for (const key of changes.fetch) this.queue.add(key);
			this.result = { kind: 'complete' };
			this.notify();
			return this.result;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Inventory check failed';
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

	private async download(key: string): Promise<SynchronizationResult> {
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		try {
			await this.commit(() => ({
				put: [{ key, entry: transitionCache(this.entry(key), { kind: 'request' }) }],
				remove: []
			}));
			const snapshot = cachedSnapshot(this.entry(key));
			const epoch = this.epoch;
			const response = await this.dependencies.transport.read(key, snapshot?.etag ?? null);
			if (this.stopped) return { kind: 'stopped' };
			if (epoch !== this.epoch) return { kind: 'complete' };
			if (response.kind === 'unavailable') {
				await this.commit(() => ({ put: [], remove: [key] }));
				return { kind: 'unavailable' };
			}
			if (response.kind === 'unchanged' && (!snapshot || snapshot.etag !== response.etag))
				throw new Error('The server confirmed a version this device does not have');
			const received = response.kind === 'found' ? response.snapshot : snapshot;
			if (!received) throw new Error('The object response contains no usable version');
			await this.commit(() => ({
				put: [
					{ key, entry: transitionCache(this.entry(key), { kind: 'receive', snapshot: received }) }
				],
				remove: []
			}));
			if (this.entry(key).kind === 'updating') this.queue.add(key);
			return { kind: 'complete' };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Object download failed';
			// Preserve the last durable copy even if persisting the failure itself is unavailable.
			this.entries.set(key, transitionCache(this.entry(key), { kind: 'failure', message }));
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
			await this.fetch(key);
		}
		return this.stopped ? { kind: 'stopped' } : !this.online ? { kind: 'offline' } : this.result;
	}
}
