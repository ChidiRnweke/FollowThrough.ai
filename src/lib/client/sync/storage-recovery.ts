import { z } from 'zod';
import {
	storageRecoveryItemSchema,
	type StorageRecoveryItem,
	type ResourceState
} from '$lib/models/sync';
import { completed, openSyncDatabase, requestValue, storedResourceSchema } from './database';

export const recoveryGeneration = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<number> => {
	const raw = await requestValue(transaction.objectStore('recovery-heads').get(accountId));
	return raw === undefined
		? 0
		: z
				.object({ accountId: z.literal(accountId), generation: z.number().int().nonnegative() })
				.parse(raw).generation;
};

export const invalidateInventory = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<void> => {
	const generation = await recoveryGeneration(transaction, accountId);
	transaction.objectStore('recovery-heads').put({ accountId, generation: generation + 1 });
	transaction.objectStore('cursors').delete(accountId);
};

export const recoverCacheRow = async <T>(
	transaction: IDBTransaction,
	accountId: string,
	key: string,
	schema: z.ZodType<T>,
	raw: unknown
): Promise<{ key: string; entry: ResourceState<T> } | null> => {
	if (raw === undefined) return null;
	const parsed = storedResourceSchema(accountId, schema).safeParse(raw);
	if (parsed.success && parsed.data.key === key) return parsed.data;
	quarantineRow(
		transaction,
		{
			accountId,
			source: 'records',
			key,
			message: 'A saved copy was damaged and will be downloaded again.',
			impact: { kind: 'cache' }
		},
		raw
	);
	const entry: ResourceState<T> = {
		kind: 'present',
		cache: { kind: 'updating', previous: null, target: null, transfer: { kind: 'queued' } }
	};
	transaction.objectStore('records').put({ schemaVersion: 2, accountId, key, entry });
	await invalidateInventory(transaction, accountId);
	return { key, entry };
};

/** Raw malformed content stays at the storage boundary, never in workspace projections. */
export const quarantineRow = (
	transaction: IDBTransaction,
	item: StorageRecoveryItem,
	raw: unknown
): void => {
	transaction.objectStore('quarantine').put({ ...item, raw });
};

export const recoveryItems = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<readonly StorageRecoveryItem[]> => {
	const rows = await requestValue(
		transaction.objectStore('quarantine').index('accountId').getAll(accountId)
	);
	return z.array(storageRecoveryItemSchema).parse(rows);
};

const legacyRecoveryText = async (accountId: string): Promise<string> => {
	const name = 'followthrough-note-sync';
	if (!(await indexedDB.databases()).some((database) => database.name === name)) return '[]';
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('Saved legacy edits could not be opened'));
	});
	try {
		if (!database.objectStoreNames.contains('note-sync-records')) return '[]';
		const transaction = database.transaction('note-sync-records', 'readonly');
		const done = completed(transaction);
		const rows = await requestValue(
			transaction
				.objectStore('note-sync-records')
				.getAll(IDBKeyRange.bound(`${accountId}:`, `${accountId}:\uffff`))
		);
		await done;
		return JSON.stringify(rows);
	} finally {
		database.close();
	}
};

export class IndexedDbStorageRecovery {
	constructor(private readonly databaseName = 'followthrough-workspace-sync') {}
	async downloadAccount(accountId: string): Promise<Blob> {
		const legacyNotes = await legacyRecoveryText(accountId);
		const database = await openSyncDatabase(this.databaseName, () => undefined);
		try {
			const transaction = database.transaction(['outbox', 'quarantine'], 'readonly');
			const done = completed(transaction);
			const [outbox, quarantine] = await Promise.all(
				['outbox', 'quarantine'].map((store) =>
					requestValue(transaction.objectStore(store).index('accountId').getAll(accountId))
				)
			);
			await done;
			return new Blob(
				[
					JSON.stringify(
						{ accountId, outbox, quarantine, legacyNotes },
						(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
						2
					)
				],
				{ type: 'application/json' }
			);
		} finally {
			database.close();
		}
	}

	async save(item: StorageRecoveryItem, raw: unknown): Promise<void> {
		const database = await openSyncDatabase(this.databaseName, () => undefined);
		try {
			const transaction = database.transaction('quarantine', 'readwrite');
			const done = completed(transaction);
			quarantineRow(transaction, item, raw);
			await done;
		} finally {
			database.close();
		}
	}
	async list(accountId: string): Promise<readonly StorageRecoveryItem[]> {
		const database = await openSyncDatabase(this.databaseName, () => undefined);
		try {
			const transaction = database.transaction('quarantine', 'readonly');
			const done = completed(transaction);
			const items = await recoveryItems(transaction, accountId);
			await done;
			return items;
		} finally {
			database.close();
		}
	}
	async download(accountId: string, source: string, key: string): Promise<Blob> {
		const database = await openSyncDatabase(this.databaseName, () => undefined);
		try {
			const transaction = database.transaction('quarantine', 'readonly');
			const done = completed(transaction);
			const row = await requestValue(
				transaction.objectStore('quarantine').get([accountId, source, key])
			);
			await done;
			storageRecoveryItemSchema.extend({ accountId: z.literal(accountId) }).parse(row);
			return new Blob(
				[
					JSON.stringify(
						row,
						(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
						2
					)
				],
				{ type: 'application/json' }
			);
		} finally {
			database.close();
		}
	}
}
