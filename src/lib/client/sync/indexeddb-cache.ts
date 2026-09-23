import { z } from 'zod';
import type { Transaction } from 'dexie';
import { syncCursorSchema } from '$lib/models/sync';
import { mergeResourceStates, resourceVersion } from '$lib/services/sync/state';
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
	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		this.database.assertAccount(accountId);
		await this.database.run('rw', ['records', 'meta'], async (tx) => {
			const records = storedTable(tx, 'records');
			const schema = storedResourceSchema(this.valueSchema);
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			if (new Set(keys).size !== keys.length)
				throw new Error('A cache commit must touch each resource only once');
			const existing = await records.bulkGet(keys);
			const previous = new Map(
				keys.map((key, index) => {
					const raw = existing[index];
					return [key, raw === undefined ? undefined : schema.parse(raw).entry];
				})
			);
			await records.bulkPut(
				changes.put.map((proposed) =>
					schema.parse({
						key: proposed.key,
						entry: mergeResourceStates(previous.get(proposed.key), proposed.entry)
					})
				)
			);
			await records.bulkDelete(
				changes.remove
					.filter((removal) => {
						const entry = previous.get(removal.key);
						return entry === undefined || resourceVersion(entry) === removal.etag;
					})
					.map((removal) => removal.key)
			);
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
