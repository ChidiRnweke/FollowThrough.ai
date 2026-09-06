import { z } from 'zod';
import { cacheEntrySchema, inventorySchema } from '$lib/models/sync';
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

/** Parses persisted data here; the coordinator never handles weak storage values. */
export class IndexedDbSyncCache<T> implements SyncCacheRepository<T> {
	private opening: Promise<IDBDatabase> | null = null;

	constructor(
		private readonly valueSchema: z.ZodType<T>,
		private readonly databaseName = 'followthrough-workspace-sync'
	) {}

	async load(accountId: string): Promise<StoredCache<T>> {
		const database = await this.open();
		const transaction = database.transaction(['records', 'inventories'], 'readonly');
		const done = completed(transaction);
		const [rows, inventory] = await Promise.all([
			requestValue(transaction.objectStore('records').index('accountId').getAll(accountId)),
			requestValue(transaction.objectStore('inventories').get(accountId)),
			done
		]);
		const records = z
			.array(
				z.object({
					schemaVersion: z.literal(1),
					accountId: z.literal(accountId),
					key: z.string().min(1),
					entry: cacheEntrySchema(this.valueSchema)
				})
			)
			.parse(rows);
		return {
			records: records.map(({ key, entry }) => ({ key, entry })),
			inventory:
				inventory === undefined
					? null
					: z
							.object({
								accountId: z.literal(accountId),
								entries: inventorySchema
							})
							.parse(inventory).entries
		};
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(['records', 'inventories'], 'readwrite');
		const done = completed(transaction);
		try {
			const records = transaction.objectStore('records');
			for (const record of changes.put) records.put({ schemaVersion: 1, accountId, ...record });
			for (const key of changes.remove) records.delete([accountId, key]);
			if (changes.inventory)
				transaction.objectStore('inventories').put({ accountId, entries: changes.inventory });
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
			const request = indexedDB.open(this.databaseName, 1);
			let blocked = false;
			request.onupgradeneeded = () => {
				const database = request.result;
				const records = database.createObjectStore('records', { keyPath: ['accountId', 'key'] });
				records.createIndex('accountId', 'accountId');
				database.createObjectStore('inventories', { keyPath: 'accountId' });
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
