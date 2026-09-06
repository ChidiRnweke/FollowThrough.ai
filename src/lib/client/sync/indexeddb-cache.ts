import { z } from 'zod';
import { syncCursorSchema, mergeResourceStates, resourceVersion } from '$lib/models/sync';
import type { CacheCommit, StoredCache, SyncCacheRepository } from './contracts';

import { requestValue, completed, openSyncDatabase, storedResourceSchema } from './database';

/** Parses persisted data here; the resource cache never handles weak storage values. */
export class IndexedDbSyncCache<T> implements SyncCacheRepository<T> {
	private opening: Promise<IDBDatabase> | null = null;

	constructor(
		private readonly valueSchema: z.ZodType<T>,
		private readonly databaseName = 'followthrough-workspace-sync'
	) {}

	async load(accountId: string): Promise<StoredCache<T>> {
		const database = await this.open();
		const transaction = database.transaction(['records', 'cursors'], 'readonly');
		const done = completed(transaction);
		const [rows, cursor] = await Promise.all([
			requestValue(transaction.objectStore('records').index('accountId').getAll(accountId)),
			requestValue(transaction.objectStore('cursors').get(accountId)),
			done
		]);
		const records = z.array(storedResourceSchema(accountId, this.valueSchema)).parse(rows);
		return {
			records: records.map(({ key, entry }) => ({ key, entry })),
			cursor:
				cursor === undefined
					? null
					: z.object({ accountId: z.literal(accountId), cursor: syncCursorSchema }).parse(cursor)
							.cursor
		};
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<CacheCommit<T>> {
		const database = await this.open();
		const transaction = database.transaction(['records', 'cursors'], 'readwrite');
		const done = completed(transaction);
		const put: CacheCommit<T>['put'][number][] = [];
		const remove: CacheCommit<T>['remove'][number][] = [];
		try {
			const records = transaction.objectStore('records');
			const keys = [
				...changes.put.map((record) => record.key),
				...changes.remove.map((record) => record.key)
			];
			if (new Set(keys).size !== keys.length)
				throw new Error('A cache commit must touch each resource only once');
			const [rows, cursor] = await Promise.all([
				Promise.all(keys.map((key) => requestValue(records.get([accountId, key])))),
				requestValue(transaction.objectStore('cursors').get(accountId))
			]);
			const current = new Map(
				keys.map((key, index) => [
					key,
					rows[index] === undefined
						? null
						: storedResourceSchema(accountId, this.valueSchema).parse(rows[index])
				])
			);
			for (const proposed of changes.put) {
				const previous = current.get(proposed.key);
				const record = {
					key: proposed.key,
					entry: previous ? mergeResourceStates(previous.entry, proposed.entry) : proposed.entry
				};
				records.put({ schemaVersion: 2, accountId, ...record });
				put.push(record);
			}
			for (const removal of changes.remove) {
				const previous = current.get(removal.key);
				if (!previous || resourceVersion(previous.entry) === removal.etag) {
					records.delete([accountId, removal.key]);
					remove.push(removal);
				} else put.push({ key: removal.key, entry: previous.entry });
			}
			const storedCursor =
				cursor === undefined
					? null
					: z.object({ accountId: z.literal(accountId), cursor: syncCursorSchema }).parse(cursor)
							.cursor;
			if (
				changes.cursor !== undefined &&
				(storedCursor === null || BigInt(changes.cursor) > BigInt(storedCursor))
			)
				transaction.objectStore('cursors').put({ accountId, cursor: changes.cursor });
		} catch (error) {
			transaction.abort();
			await done.catch(() => {
				return { kind: 'failure' };
			});
			throw error;
		}
		await done;
		return { ...changes, put, remove };
	}

	async close(): Promise<void> {
		if (!this.opening) return;
		const database = await this.opening;
		database.close();
		this.opening = null;
	}

	private open(): Promise<IDBDatabase> {
		this.opening ??= openSyncDatabase(this.databaseName, () => {
			this.opening = null;
		}).catch((error) => {
			this.opening = null;
			throw error;
		});
		return this.opening;
	}
}
