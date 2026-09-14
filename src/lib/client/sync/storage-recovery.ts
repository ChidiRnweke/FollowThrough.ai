import type { Transaction } from 'dexie';
import { z } from 'zod';
import {
	storageRecoveryItemSchema,
	initialCacheGeneration,
	type StorageRecoveryItem,
	type ResourceState
} from '$lib/models/sync';
import {
	completed,
	WorkspaceDatabase,
	storedTable,
	requestValue,
	storedResourceSchema
} from './database';

export const recoveryGeneration = async (
	transaction: Transaction,
	accountId: string
): Promise<string> => {
	const store = storedTable(transaction, 'recovery-heads');
	const raw = await store.get(accountId);
	if (raw === undefined) return initialCacheGeneration;
	const parsed = z
		.object({ accountId: z.literal(accountId), generation: z.string().uuid() })
		.safeParse(raw);
	if (parsed.success) return parsed.data.generation;
	await quarantineRow(
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
	await store.put({ accountId, generation });
	await storedTable(transaction, 'cursors').delete(accountId);
	return generation;
};

export const invalidateInventory = async (
	transaction: Transaction,
	accountId: string
): Promise<void> => {
	await recoveryGeneration(transaction, accountId);
	await storedTable(transaction, 'recovery-heads').put({
		accountId,
		generation: crypto.randomUUID()
	});
	await storedTable(transaction, 'cursors').delete(accountId);
};

export const recoverCacheRow = async <T>(
	transaction: Transaction,
	accountId: string,
	key: string,
	schema: z.ZodType<T>,
	raw: unknown
): Promise<{ key: string; entry: ResourceState<T> } | null> => {
	if (raw === undefined) return null;
	const parsed = storedResourceSchema(accountId, schema).safeParse(raw);
	if (parsed.success && parsed.data.key === key) return parsed.data;
	await quarantineRow(
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
	const entry: ResourceState<T> = { kind: 'requested' };
	await storedTable(transaction, 'records').put({ schemaVersion: 3, accountId, key, entry });
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
export const quarantineRow = async (
	transaction: Transaction,
	item: StorageRecoveryItem,
	raw: unknown
): Promise<void> => {
	const store = storedTable(transaction, 'quarantine');
	const existing = await store.get([item.accountId, item.source, item.key]);
	if (!removedRecoverySchema.safeParse(existing).success) await store.put({ ...item, raw });
};

export const recoveryItems = async (
	transaction: Transaction,
	accountId: string
): Promise<readonly StorageRecoveryItem[]> => {
	const store = storedTable(transaction, 'quarantine');
	const [rows, keys] = await Promise.all([
		store.where('accountId').equals(accountId).toArray(),
		store.where('accountId').equals(accountId).primaryKeys()
	]);
	const items: StorageRecoveryItem[] = [];
	for (const [index, row] of rows.entries()) {
		if (removedRecoverySchema.safeParse(row).success) continue;
		const parsed = storageRecoveryItemSchema
			.extend({ accountId: z.literal(accountId) })
			.safeParse(row);
		if (parsed.success) {
			items.push(parsed.data);
			continue;
		}
		const item: StorageRecoveryItem = {
			accountId,
			source: 'recovery-metadata',
			key: JSON.stringify(keys[index]),
			message:
				'A recovery entry had damaged metadata. Its original content is preserved for download.',
			impact: { kind: 'write', operationId: null }
		};
		await store.delete(keys[index]);
		quarantineRow(transaction, item, row);
		items.push(item);
	}
	return items;
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
	private readonly database: WorkspaceDatabase;
	constructor(
		databaseName = 'followthrough-workspace-sync',
		private readonly legacyDatabaseName = 'followthrough-note-sync',
		database = new WorkspaceDatabase(databaseName)
	) {
		this.database = database;
	}
	async downloadAccount(accountId: string): Promise<Blob> {
		const legacyNotes = await legacyRecoveryText(accountId);
		const [outbox, quarantine] = await this.database.transaction(
			'r',
			['outbox', 'quarantine'],
			async (transaction): Promise<unknown[][]> =>
				await Promise.all(
					['outbox', 'quarantine'].map((name) =>
						storedTable(transaction, name).where('accountId').equals(accountId).toArray()
					)
				)
		);
		return recoveryBlob({ accountId, outbox, quarantine, legacyNotes });
	}
	async remove(accountId: string, source: string, key: string): Promise<void> {
		await this.database.transaction('rw', 'quarantine', async (transaction) => {
			const store = storedTable(transaction, 'quarantine');
			const row = await store.get([accountId, source, key]);
			z.union([storageRecoveryItemSchema, removedRecoverySchema])
				.refine(
					(item) => item.accountId === accountId && item.source === source && item.key === key
				)
				.parse(row);
			if (source === 'legacy-note' || source === 'imports' || source === 'outbox')
				await store.put({ accountId, source, key, resolution: 'removed' });
			else await store.delete([accountId, source, key]);
		});
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
		await this.database.transaction('rw', 'quarantine', (transaction) =>
			quarantineRow(transaction, item, raw)
		);
	}
	list(accountId: string): Promise<readonly StorageRecoveryItem[]> {
		return this.database.transaction('rw', 'quarantine', (transaction) =>
			recoveryItems(transaction, accountId)
		);
	}
	async download(accountId: string, source: string, key: string): Promise<Blob> {
		const row = await this.database.table('quarantine').get([accountId, source, key]);
		storageRecoveryItemSchema.extend({ accountId: z.literal(accountId) }).parse(row);
		return recoveryBlob(row);
	}
	close(): void {
		this.database.close();
	}
}

const recoveryBlob = (value: unknown): Blob =>
	new Blob(
		[
			JSON.stringify(
				value,
				(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
				2
			)
		],
		{ type: 'application/json' }
	);
