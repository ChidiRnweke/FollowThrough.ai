import { liveQuery } from 'dexie';
import type { z } from 'zod';
import type { StoredCache } from './contracts';
import type { OutboxProjection, OutboxRepository } from './outbox-contracts';
import type { StorageRecoveryItem } from '$lib/models/sync';
import { WorkspaceDatabase } from './database';
import { IndexedDbSyncCache } from './indexeddb-cache';
import { IndexedDbOutbox } from './indexeddb-outbox';
import { IndexedDbStorageRecovery } from './storage-recovery';

export interface WorkspaceLocalProjection<C, T> {
	readonly cache: StoredCache<T>;
	readonly writes: OutboxProjection<C, T>;
	readonly recovery: readonly StorageRecoveryItem[];
}
export interface WorkspaceLocalRepository<C, T> extends OutboxRepository<C, T> {
	read(accountId: string): Promise<WorkspaceLocalProjection<C, T>>;
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void;
}

/** One connection and transaction boundary for local authority, intent and proof. */
export class DexieWorkspaceRepository<C, T>
	extends IndexedDbOutbox<C, T>
	implements WorkspaceLocalRepository<C, T>
{
	readonly cache: IndexedDbSyncCache<T>;
	readonly recovery: IndexedDbStorageRecovery;
	private readonly accounts = new Map<
		string,
		{
			generation: number;
			published: number;
			listeners: Set<(projection: WorkspaceLocalProjection<C, T>) => void>;
		}
	>();
	private account(accountId: string) {
		let account = this.accounts.get(accountId);
		if (!account) {
			account = { generation: 0, published: 0, listeners: new Set() };
			this.accounts.set(accountId, account);
		}
		return account;
	}
	constructor(command: z.ZodType<C>, value: z.ZodType<T>, name = 'followthrough-workspace-sync') {
		const database = new WorkspaceDatabase(name);
		super(command, value, name, database);
		this.cache = new IndexedDbSyncCache(value, name, database);
		this.recovery = new IndexedDbStorageRecovery(name, undefined, database);
	}
	async read(accountId: string): Promise<WorkspaceLocalProjection<C, T>> {
		const account = this.account(accountId);
		const generation = ++account.generation;
		const projection = await this.database.transaction('rw', this.database.tables, async () => ({
			cache: await this.cache.load(accountId),
			writes: await super.snapshot(accountId),
			recovery: await this.recovery.list(accountId)
		}));
		if (generation > account.published) {
			account.published = generation;
			for (const listener of account.listeners) listener(projection);
		}
		return projection;
	}
	override async snapshot(accountId: string): Promise<OutboxProjection<C, T>> {
		return (await this.read(accountId)).writes;
	}
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void {
		const account = this.account(accountId);
		account.listeners.add(changed);
		// Observe primary-key ranges: updates as well as insertions/deletions invalidate them.
		// Recovery may write, so it runs after the read-only live query, outside its context.
		const subscription = liveQuery(() =>
			this.database.transaction('r', this.database.tables, async () => {
				await Promise.all(
					this.database.tables.map((table) =>
						table.schema.primKey.compound
							? table.where(':id').between([accountId], [accountId, []]).count()
							: table.get(accountId)
					)
				);
			})
		).subscribe({
			next: () => {
				void this.read(accountId).catch((error) => {
					failed(
						error instanceof Error ? error : new Error('Workspace storage could not be observed')
					);
					return { kind: 'failure' };
				});
			},
			error: (error) =>
				failed(
					error instanceof Error ? error : new Error('Workspace storage could not be observed')
				)
		});
		return () => {
			subscription.unsubscribe();
			account.listeners.delete(changed);
		};
	}
}
