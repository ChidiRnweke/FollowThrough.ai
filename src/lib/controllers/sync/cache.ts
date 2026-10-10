import type { SyncResourceRules } from '$lib/services/sync/state';
import type { ResourceCacheStore } from '$lib/stores/sync/cache';
import type { SyncPage, SyncObjectRead } from '$lib/models/sync';
import {
	type ResourceDeletion,
	initialSyncCursor,
	type SyncCursor,
	type SyncEtag,
	type ResourceState,
	type CacheAccess,
	type TransferState,
	type SyncSnapshot
} from '$lib/models/sync';

import type { CacheCommit, StoredCache, SynchronizationResult } from '$lib/models/sync';

export interface SyncCacheRepository<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	commit(accountId: string, changes: CacheCommit<T>): Promise<void>;
}

export interface SyncReadTransport<T> {
	pull(since: SyncCursor): Promise<SyncPage<T>>;
	read(key: string, etag: SyncEtag | null): Promise<SyncObjectRead<T>>;
}

export interface ResourceCacheDependencies<T> {
	repository: SyncCacheRepository<T>;
	transport: SyncReadTransport<T>;
}

/** One account and one loading path. Durable writes precede notifications to readers. */
export interface ResourceCacheController<T> {
	readonly accountId: string;
	readonly status: SynchronizationResult;
	readonly downloadProgress: { completed: number; total: number; inventoryComplete: boolean };
	readonly failedDownloads: number;
	readonly records: ReadonlyMap<string, ResourceState<T>>;
	readonly availability: 'unknown' | 'complete';
	subscribe(listener: () => void): () => void;
	access(key: string): CacheAccess<T>;
	setOnline(online: boolean): void;
	stop(): void;
	initialize(): Promise<void>;
	reload(): Promise<void>;
	refresh(): Promise<SynchronizationResult>;
	open(key: string): Promise<CacheAccess<T>>;
	accept(key: string, received: SyncSnapshot<T> | ResourceDeletion): Promise<void>;
	transfer(key: string): TransferState | undefined;
	applyStored(stored: StoredCache<T>, notify?: boolean): void;
}

export class CacheSynchronization<T> implements ResourceCacheController<T> {
	constructor(
		private readonly syncResourceRules: SyncResourceRules,
		readonly accountId: string,
		private readonly dependencies: ResourceCacheDependencies<T>,
		private readonly state: ResourceCacheStore<T>
	) {}

	subscribe(listener: () => void): () => void {
		return this.state.subscribe(listener);
	}

	get status(): SynchronizationResult {
		return this.state.read().result;
	}
	get downloadProgress(): { completed: number; total: number; inventoryComplete: boolean } {
		const present = [...this.state.read().entries.values()].filter(
			(entry) => entry.kind !== 'deleted'
		);
		return {
			completed: present.filter(this.syncResourceRules.resourceCurrent).length,
			total: present.length,
			inventoryComplete: this.state.read().inventoryComplete
		};
	}
	get failedDownloads(): number {
		return [...this.state.attempts().values()].filter(
			(attempt) => attempt.transfer.kind === 'failed'
		).length;
	}
	get records(): ReadonlyMap<string, ResourceState<T>> {
		return this.state.read().entries;
	}

	get availability(): 'unknown' | 'complete' {
		return this.state.read().cursor !== null &&
			this.state.read().inventoryComplete &&
			!this.state.read().stopped
			? 'complete'
			: 'unknown';
	}

	access(key: string): CacheAccess<T> {
		if (this.state.read().stopped) return { kind: 'unavailable' };
		return this.syncResourceRules.accessCache(
			this.entry(key),
			this.state.read().online,
			this.transfer(key)
		);
	}

	setOnline(online: boolean): void {
		this.state.update({ online });
		this.notify();
	}

	stop(): void {
		this.state.update({ stopped: true });
		this.state.clearAttempts();
		this.state.update({ entries: new Map() });
		this.state.update({ result: { kind: 'stopped' } });
		this.notify();
	}

	initialize(): Promise<void> {
		const existing = this.state.read().initializing;
		if (existing) return existing;
		const initializing = this.restore().catch((error) => {
			this.state.update({ initializing: null });
			throw error;
		});
		this.state.update({ initializing });
		return initializing;
	}

	/** Incorporate another tab's durable records without replacing newer local knowledge. */
	async reload(): Promise<void> {
		await this.initialize();
		await this.restore();
	}

	refresh(): Promise<SynchronizationResult> {
		const existing = this.state.read().checking;
		if (existing) return existing;
		const checking = this.pullChanges().finally(() => {
			this.state.update({ checking: null });
		});
		this.state.update({ checking });
		return checking;
	}

	async open(key: string): Promise<CacheAccess<T>> {
		try {
			await this.initialize();
			const current = this.access(key);
			if (
				current.kind === 'ready' ||
				current.kind === 'deleted' ||
				!this.state.read().online ||
				this.state.read().stopped
			)
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
		if (this.state.read().stopped) return;
		await this.commit(() => ({
			put: [{ key, entry: this.syncResourceRules.receiveResource(undefined, received) }],
			remove: []
		}));
	}

	private entry(key: string): ResourceState<T> | undefined {
		return this.state.read().entries.get(key);
	}
	transfer(key: string): TransferState | undefined {
		const attempt = this.state.attempts().get(key);
		return !this.syncResourceRules.resourceCurrent(this.entry(key)) &&
			this.entry(key)?.kind !== 'deleted' &&
			attempt?.target === this.syncResourceRules.resourceVersion(this.entry(key))
			? attempt?.transfer
			: undefined;
	}
	private notify(): void {
		for (const listener of this.state.listeners()) listener();
	}

	private async restore(): Promise<void> {
		const generation = this.state.read().readGeneration + 1;
		this.state.update({ readGeneration: generation });
		const stored = await this.dependencies.repository.load(this.accountId);
		if (generation === this.state.read().readGeneration) this.applyStored(stored);
	}

	/** One authoritative snapshot; live attempts never alter durable resource knowledge. */
	applyStored({ records, cursor, inventoryComplete }: StoredCache<T>, notify = true): void {
		if (this.state.read().stopped) return;
		this.state.update({
			readGeneration: this.state.read().readGeneration + 1,
			initializing: this.state.read().initializing ?? Promise.resolve(),
			cursor,
			inventoryComplete,
			entries: new Map(records.map(({ key, entry }) => [key, entry]))
		});
		for (const key of this.state.attempts().keys())
			if (!this.transfer(key)) this.state.removeAttempt(key);
		if (notify) this.notify();
	}

	private async commit(compute: () => CacheCommit<T>): Promise<void> {
		if (this.state.read().stopped) return;
		await this.dependencies.repository.commit(this.accountId, {
			...compute()
		});
		await this.restore();
	}

	private async pullChanges(): Promise<SynchronizationResult> {
		try {
			await this.reload();
			if (this.state.read().stopped) return { kind: 'stopped' };
			if (!this.state.read().online) return { kind: 'offline' };
			let more: boolean;
			do {
				const before = this.state.read().cursor ?? initialSyncCursor;
				const batch = await this.dependencies.transport.pull(before);
				more = batch.hasMore;
				if (more && BigInt(batch.cursor) <= BigInt(before))
					throw new Error('The server page did not advance its checkpoint');
				await this.commit(() => {
					if (BigInt(batch.cursor) < BigInt(this.state.read().cursor ?? initialSyncCursor))
						throw new Error('The server change cursor moved backwards');
					const put = batch.records.map(({ key, resource }) => ({
						key,
						entry: this.syncResourceRules.receiveResource<T>(
							undefined,
							resource.kind === 'found' ? resource.snapshot : resource
						)
					}));
					return {
						put,
						remove: [],
						cursor: batch.cursor,
						inventoryComplete: this.state.read().inventoryComplete || !more
					};
				});
				if (!this.state.read().online) return { kind: 'offline' };
			} while (more && !this.state.read().stopped);
			if (this.state.read().stopped) return { kind: 'stopped' };
			this.state.update({ result: { kind: 'complete' } });
			this.notify();
			return this.state.read().result;
		} catch (error) {
			if (this.state.read().stopped) return { kind: 'stopped' };
			const message = error instanceof Error ? error.message : 'Change synchronization failed';
			this.state.update({ result: { kind: 'failure', message } });
			this.notify();
			return { kind: 'failure', message };
		}
	}

	private fetch(key: string): Promise<SynchronizationResult> {
		const existing = this.state.fetching(key);
		if (existing) return existing;
		const request = this.read(key).finally(() => this.state.removeFetching(key));
		this.state.setFetching(key, request);
		return request;
	}

	private async waitForRead(key: string): Promise<SynchronizationResult> {
		const interrupted = Promise.withResolvers<SynchronizationResult>();
		const unsubscribe = this.subscribe(() => {
			if (this.state.read().stopped) interrupted.resolve({ kind: 'stopped' });
			else if (!this.state.read().online) interrupted.resolve({ kind: 'offline' });
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
			if (this.state.read().stopped) return { kind: 'stopped' };
			if (response.kind === 'unchanged') throw new Error('An uncached read returned no body');
			if (response.kind === 'unavailable') {
				this.state.setAttempt(key, {
					target: this.syncResourceRules.resourceVersion(this.entry(key)),
					transfer: { kind: 'missing' }
				});
				this.notify();
				return { kind: 'unavailable' };
			}
			await this.commit(() => ({
				put: [
					{
						key,
						entry: this.syncResourceRules.receiveResource<T>(
							undefined,
							response.kind === 'found' ? response.snapshot : response
						)
					}
				],
				remove: []
			}));
			this.state.removeAttempt(key);
			return { kind: 'complete' };
		} catch (error) {
			if (this.state.read().stopped) return { kind: 'stopped' };
			const message =
				error instanceof Error ? error.message : 'The resource could not be downloaded';
			this.state.setAttempt(key, {
				target: this.syncResourceRules.resourceVersion(this.entry(key)),
				transfer: { kind: 'failed', message }
			});
			this.notify();
			return { kind: 'failure', message };
		}
	}
}
