import { z } from 'zod';
import { cacheEntrySchema, resourceStateSchema } from '$lib/models/sync';

export const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});

export const completed = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});

export const storedResourceSchema = <T>(accountId: string, value: z.ZodType<T>) => {
	const identity = { accountId: z.literal(accountId), key: z.string().min(1) };
	return z.union([
		z.object({ ...identity, schemaVersion: z.literal(2), entry: resourceStateSchema(value) }),
		z
			.object({ ...identity, schemaVersion: z.literal(1), entry: cacheEntrySchema(value) })
			.transform((record) => ({
				...record,
				entry: { kind: 'present' as const, cache: record.entry }
			}))
	]);
};

/** Cache and outbox share a database so acknowledgement and the resulting body commit together. */
export const openSyncDatabase = (name: string, onVersionChange: () => void): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open(name, 4);
		let blocked = false;
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains('records')) {
				const records = database.createObjectStore('records', { keyPath: ['accountId', 'key'] });
				records.createIndex('accountId', 'accountId');
			}
			if (!database.objectStoreNames.contains('cursors'))
				database.createObjectStore('cursors', { keyPath: 'accountId' });
			if (!database.objectStoreNames.contains('outbox')) {
				const outbox = database.createObjectStore('outbox', {
					keyPath: ['accountId', 'entry.sequence']
				});
				outbox.createIndex('accountId', 'accountId');
				outbox.createIndex('operation', ['accountId', 'entry.intent.operationId'], {
					unique: true
				});
			}
			if (!database.objectStoreNames.contains('imports'))
				database.createObjectStore('imports', { keyPath: ['accountId', 'source'] });
			if (!database.objectStoreNames.contains('queue-heads'))
				database.createObjectStore('queue-heads', { keyPath: 'accountId' });
		};
		request.onsuccess = () => {
			if (blocked) {
				request.result.close();
				return;
			}
			request.result.onversionchange = () => {
				request.result.close();
				onVersionChange();
			};
			resolve(request.result);
		};
		request.onerror = () =>
			reject(request.error ?? new Error('Workspace storage could not be opened'));
		request.onblocked = () => {
			blocked = true;
			reject(new Error('Close other app tabs to upgrade workspace storage'));
		};
	});
