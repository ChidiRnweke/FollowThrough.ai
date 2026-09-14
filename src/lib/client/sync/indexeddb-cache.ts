import { z } from 'zod';
import { syncCursorSchema, mergeResourceStates, resourceVersion } from '$lib/models/sync';
import type { CacheCommit, StoredCache, SyncCacheRepository } from './contracts';
import { WorkspaceDatabase, storedResourceSchema, storedTable } from './database';

const checkpointSchema = z.object({
	key: z.literal('checkpoint'),
	cursor: syncCursorSchema,
	inventoryComplete: z.boolean()
});

/** Complete resources and their inventory checkpoint commit together. Reads never repair data. */
export class IndexedDbSyncCache<T> implements SyncCacheRepository<T> {
	constructor(
		private readonly valueSchema: z.ZodType<T>,
		readonly database: WorkspaceDatabase
	) {}
	async load(accountId: string): Promise<StoredCache<T>> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['records', 'meta'], async (tx) => {
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
		});
	}
	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		this.database.assertAccount(accountId);
		await this.database.run('rw', ['records', 'meta'], async (tx) => {
			const records = storedTable(tx, 'records');
			const schema = storedResourceSchema(this.valueSchema);
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			if (new Set(keys).size !== keys.length)
				throw new Error('A cache commit must touch each resource only once');
			for (const proposed of changes.put) {
				const raw = await records.get(proposed.key);
				const previous = raw === undefined ? undefined : schema.parse(raw).entry;
				await records.put(
					schema.parse({ key: proposed.key, entry: mergeResourceStates(previous, proposed.entry) })
				);
			}
			for (const removal of changes.remove) {
				const raw = await records.get(removal.key);
				if (raw === undefined || resourceVersion(schema.parse(raw).entry) === removal.etag)
					await records.delete(removal.key);
			}
			if (changes.cursor !== undefined) {
				const raw = await storedTable(tx, 'meta').get('checkpoint');
				const previous = raw === undefined ? null : checkpointSchema.parse(raw);
				if (previous === null || BigInt(changes.cursor) >= BigInt(previous.cursor))
					await storedTable(tx, 'meta').put({
						key: 'checkpoint',
						cursor: changes.cursor,
						inventoryComplete: previous?.inventoryComplete || changes.inventoryComplete === true
					});
			}
		});
	}
	async close(): Promise<void> {
		this.database.close();
	}
}
