import type { CacheStorage, CacheTransaction } from '$lib/models/browser-workspace';
import { syncCursorSchema } from '$lib/models/sync';
import type { Transaction } from 'dexie';
import { z } from 'zod';

import type { StoredCache } from './contracts';
import { WorkspaceDatabase, storedResourceSchema, storedTable } from './database';

const checkpointSchema = z.object({
	key: z.literal('checkpoint'),
	cursor: syncCursorSchema,
	inventoryComplete: z.boolean()
});

/** Complete resources and their inventory checkpoint commit together. Reads never repair data. */
export class IndexedDbSyncCache<T> implements CacheStorage<T> {
	constructor(
		private readonly valueSchema: z.ZodType<T>,
		readonly database: WorkspaceDatabase
	) {}
	async load(accountId: string): Promise<StoredCache<T>> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['records', 'meta'], (tx) => this.loadIn(tx));
	}
	async loadIn(tx: Transaction): Promise<StoredCache<T>> {
		const records = z
			.array(storedResourceSchema(this.valueSchema))
			.parse(await storedTable(tx, 'records').toArray());
		const raw = await storedTable(tx, 'meta').get('checkpoint');
		const checkpoint = raw === undefined ? null : checkpointSchema.parse(raw);
		return {
			records,
			cursor: checkpoint?.cursor ?? null,
			inventoryComplete: checkpoint?.inventoryComplete ?? false
		};
	}

	async transaction<R>(
		accountId: string,
		work: (tx: CacheTransaction<T>) => Promise<R>
	): Promise<R> {
		this.database.assertAccount(accountId);
		return this.database.run('rw', ['records', 'meta'], (tx) =>
			work({
				resources: async (keys) => {
					const existing = await storedTable(tx, 'records').bulkGet([...keys]);
					return new Map(
						keys.map((key, index) => {
							const raw = existing[index];
							return [
								key,
								raw === undefined
									? undefined
									: storedResourceSchema(this.valueSchema).parse(raw).entry
							];
						})
					);
				},
				checkpoint: async () => {
					const raw = await storedTable(tx, 'meta').get('checkpoint');
					return raw === undefined ? null : checkpointSchema.parse(raw);
				},
				put: async (records) => {
					await storedTable(tx, 'records').bulkPut(
						records.map((row) => storedResourceSchema(this.valueSchema).parse(row))
					);
				},
				remove: async (keys) => {
					await storedTable(tx, 'records').bulkDelete([...keys]);
				},
				putCheckpoint: async (checkpoint) => {
					await storedTable(tx, 'meta').put({ key: 'checkpoint', ...checkpoint });
				}
			})
		);
	}
	async close(): Promise<void> {
		this.database.close();
	}
}
