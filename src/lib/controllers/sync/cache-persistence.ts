import type { CacheStorage } from '$lib/models/browser-workspace';
import type { CacheCommit } from '$lib/models/sync';
import type { ICacheCommitService } from '$lib/services/sync/state';
import type { SyncCacheRepository } from './cache';
export type {
	CacheCheckpoint,
	CacheStorage,
	CacheTransaction
} from '$lib/models/browser-workspace';

/** Merge against the values read in this transaction, including writes from other tabs. */
export class CachePersistence<T> implements SyncCacheRepository<T> {
	constructor(
		private readonly storage: CacheStorage<T>,
		private readonly rules: ICacheCommitService
	) {}
	load(accountId: string) {
		return this.storage.load(accountId);
	}
	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		await this.storage.transaction(accountId, async (tx) => {
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			const previous = await tx.resources(keys);
			const checkpoint = changes.cursor === undefined ? null : await tx.checkpoint();
			const decision = this.rules.decide(previous, checkpoint, changes);
			await tx.put(decision.put);
			await tx.remove(decision.remove);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
		});
	}
}
