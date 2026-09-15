import { liveQuery } from 'dexie';
import type { z } from 'zod';
import type { StoredCache } from './contracts';
import type { OutboxProjection, OutboxRepository } from './outbox-contracts';
import { WorkspaceDatabase } from './database';
import { IndexedDbSyncCache } from './indexeddb-cache';
import { IndexedDbOutbox } from './indexeddb-outbox';

export interface WorkspaceLocalProjection<C, T> {
	readonly cache: StoredCache<T>;
	readonly writes: OutboxProjection<C, T>;
}
export interface WorkspaceLocalRepository<C, T> extends OutboxRepository<C, T> {
	read(accountId: string): Promise<WorkspaceLocalProjection<C, T>>;
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void;
}

/** Dexie observes the actual readonly projection, including changes made by another tab. */
export class DexieWorkspaceRepository<C, T>
	extends IndexedDbOutbox<C, T>
	implements WorkspaceLocalRepository<C, T>
{
	readonly cache: IndexedDbSyncCache<T>;
	constructor(
		accountId: string,
		command: z.ZodType<C>,
		value: z.ZodType<T>,
		name = 'followthrough-workspace-sync'
	) {
		const database = new WorkspaceDatabase(accountId, name);
		super(command, value, database);
		this.cache = new IndexedDbSyncCache(value, database);
	}
	async read(accountId: string): Promise<WorkspaceLocalProjection<C, T>> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['records', 'outbox', 'receipts', 'meta'], async (tx) => ({
			cache: await this.cache.loadIn(tx),
			writes: await this.snapshotIn(tx)
		}));
	}
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void {
		const subscription = liveQuery(async () => this.read(accountId)).subscribe({
			next: changed,
			error: (error) =>
				failed(
					error instanceof Error ? error : new Error('Workspace storage could not be observed')
				)
		});
		const stopped = () => {
			subscription.unsubscribe();
			failed(this.database.lifetime.signal.reason);
		};
		this.database.lifetime.signal.addEventListener('abort', stopped, { once: true });
		return () => {
			subscription.unsubscribe();
			this.database.lifetime.signal.removeEventListener('abort', stopped);
		};
	}
}
