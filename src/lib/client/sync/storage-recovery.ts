import { z } from 'zod';
import {
	storageRecoveryItemSchema,
	initialCacheGeneration,
	type StorageRecoveryItem,
	type ResourceState
} from '$lib/models/sync';
import { completed, openSyncDatabase, requestValue, storedResourceSchema } from './database';

export const recoveryGeneration = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<string> => {
	const store = transaction.objectStore('recovery-heads');
	const raw = await requestValue(store.get(accountId));
	if (raw === undefined) return initialCacheGeneration;
	const parsed = z
		.object({ accountId: z.literal(accountId), generation: z.string().uuid() })
		.safeParse(raw);
	if (parsed.success) return parsed.data.generation;
	quarantineRow(
		transaction,
		{
			accountId,
			source: 'recovery-heads',
			key: accountId,
			message: 'The cache recovery marker was damaged. The workspace inventory will be rebuilt.',
			impact: { kind: 'cache' }
		},
		raw
	);
	const generation = crypto.randomUUID();
	store.put({ accountId, generation });
	transaction.objectStore('cursors').delete(accountId);
	return generation;
};

export const invalidateInventory = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<void> => {
	await recoveryGeneration(transaction, accountId);
	transaction.objectStore('recovery-heads').put({ accountId, generation: crypto.randomUUID() });
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

const removedRecoverySchema = z.object({
	accountId: z.string(),
	source: z.string(),
	key: z.string(),
	resolution: z.literal('removed')
});

/** Raw malformed content stays at the storage boundary, never in workspace projections. */
export const quarantineRow = (
	transaction: IDBTransaction,
	item: StorageRecoveryItem,
	raw: unknown
): void => {
	const store = transaction.objectStore('quarantine');
	const existing = store.get([item.accountId, item.source, item.key]);
	existing.onsuccess = () => {
		if (!removedRecoverySchema.safeParse(existing.result).success) store.put({ ...item, raw });
	};
};

export const recoveryItems = async (
	transaction: IDBTransaction,
	accountId: string
): Promise<readonly StorageRecoveryItem[]> => {
	const store = transaction.objectStore('quarantine');
	const [rows, keys] = await Promise.all([
		requestValue(store.index('accountId').getAll(accountId)),
		requestValue(store.index('accountId').getAllKeys(accountId))
	]);
	return rows.flatMap((row, index) => {
		if (removedRecoverySchema.safeParse(row).success) return [];
		const parsed = storageRecoveryItemSchema
			.extend({ accountId: z.literal(accountId) })
			.safeParse(row);
		if (parsed.success) return [parsed.data];
		const item: StorageRecoveryItem = {
			accountId,
			source: 'recovery-metadata',
			key: JSON.stringify(keys[index]),
			message:
				'A recovery entry had damaged metadata. Its original content is preserved for download.',
			impact: { kind: 'write', operationId: null }
		};
		store.delete(keys[index]);
		quarantineRow(transaction, item, row);
		return [item];
	});
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
	constructor(
		private readonly databaseName = 'followthrough-workspace-sync',
		private readonly legacyDatabaseName = 'followthrough-note-sync'
	) {}
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

	async remove(accountId: string, source: string, key: string): Promise<void> {
		const database = await openSyncDatabase(this.databaseName, () => undefined);
		try {
			const transaction = database.transaction('quarantine', 'readwrite');
			const done = completed(transaction);
			const store = transaction.objectStore('quarantine');
			const row = await requestValue(store.get([accountId, source, key]));
			z.union([storageRecoveryItemSchema, removedRecoverySchema])
				.refine(
					(item) => item.accountId === accountId && item.source === source && item.key === key
				)
				.parse(row);
			// Retain only identity proof. Reopening an old source cannot resurrect the blocker.
			if (source === 'legacy-note' || source === 'imports' || source === 'outbox')
				store.put({ accountId, source, key, resolution: 'removed' });
			else store.delete([accountId, source, key]);
			await done;
		} finally {
			database.close();
		}
		if (source === 'legacy-note') await this.removeLegacyRow(accountId, key);
	}

	private async removeLegacyRow(accountId: string, key: string): Promise<void> {
		if (!key.startsWith(`${accountId}:`))
			throw new Error('The recovery source belongs to another account');
		if (
			!(await indexedDB.databases()).some((database) => database.name === this.legacyDatabaseName)
		)
			return;
		const database = await requestValue(indexedDB.open(this.legacyDatabaseName));
		try {
			const transaction = database.transaction('note-sync-records', 'readwrite');
			const done = completed(transaction);
			transaction.objectStore('note-sync-records').delete(key);
			await done;
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
			const transaction = database.transaction('quarantine', 'readwrite');
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
