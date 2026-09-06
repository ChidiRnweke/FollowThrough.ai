import { z } from 'zod';
import { cacheEntrySchema, resourceStateSchema, syncCursorSchema } from '$lib/models/sync';
import type { CacheCommit, StoredCache, SyncCacheRepository } from './contracts';

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});

const completed = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});

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
		const identity = { accountId: z.literal(accountId), key: z.string().min(1) };
		const records = z
			.array(
				z.union([
					z.object({
						...identity,
						schemaVersion: z.literal(2),
						entry: resourceStateSchema(this.valueSchema)
					}),
					z
						.object({
							...identity,
							schemaVersion: z.literal(1),
							entry: cacheEntrySchema(this.valueSchema)
						})
						.transform((record) => ({
							...record,
							entry: { kind: 'present' as const, cache: record.entry }
						}))
				])
			)
			.parse(rows);
		return {
			records: records.map(({ key, entry }) => ({ key, entry })),
			cursor:
				cursor === undefined
					? null
					: z.object({ accountId: z.literal(accountId), cursor: syncCursorSchema }).parse(cursor)
							.cursor
		};
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(['records', 'cursors'], 'readwrite');
		const done = completed(transaction);
		try {
			const records = transaction.objectStore('records');
			for (const record of changes.put) records.put({ schemaVersion: 2, accountId, ...record });
			for (const key of changes.remove) records.delete([accountId, key]);
			if (changes.cursor !== undefined)
				transaction.objectStore('cursors').put({ accountId, cursor: changes.cursor });
		} catch (error) {
			transaction.abort();
			await done.catch(() => {
				return { kind: 'failure' };
			});
			throw error;
		}
		await done;
	}

	async close(): Promise<void> {
		if (!this.opening) return;
		const database = await this.opening;
		database.close();
		this.opening = null;
	}

	private open(): Promise<IDBDatabase> {
		this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.databaseName, 2);
			let blocked = false;
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains('records')) {
					const records = database.createObjectStore('records', { keyPath: ['accountId', 'key'] });
					records.createIndex('accountId', 'accountId');
				}
				if (!database.objectStoreNames.contains('cursors'))
					database.createObjectStore('cursors', { keyPath: 'accountId' });
			};
			request.onsuccess = () => {
				if (blocked) {
					request.result.close();
					return;
				}
				request.result.onversionchange = () => {
					request.result.close();
					this.opening = null;
				};
				resolve(request.result);
			};
			request.onerror = () =>
				reject(request.error ?? new Error('Workspace storage could not be opened'));
			request.onblocked = () => {
				blocked = true;
				reject(new Error('Close other app tabs to upgrade workspace storage'));
			};
		}).catch((error) => {
			this.opening = null;
			throw error;
		});
		return this.opening;
	}
}
