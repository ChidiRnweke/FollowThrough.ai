import { Dexie, type Table, type Transaction } from 'dexie';
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

/** Native version 6 upgrades in place to Dexie version 1 (native version 10). */
export class WorkspaceDatabase extends Dexie {
	private upgradeBlocked = false;
	constructor(name = 'followthrough-workspace-sync') {
		super(name);
		this.version(1).stores({
			'recovery-heads': 'accountId',
			acknowledgements: '[accountId+operationId], accountId',
			quarantine: '[accountId+source+key], accountId',
			records: '[accountId+key], accountId',
			cursors: 'accountId',
			outbox: '[accountId+entry.sequence], accountId, &[accountId+entry.intent.operationId]',
			'write-receipts': '[accountId+key]',
			imports: '[accountId+source]',
			'queue-heads': 'accountId'
		});
		this.on('blocked', () => {
			this.upgradeBlocked = true;
			this.close();
		});
		this.on('versionchange', () => this.close());
	}
	override open(): ReturnType<Dexie['open']> {
		this.upgradeBlocked = false;
		return super.open().catch((error) => {
			if (this.upgradeBlocked)
				throw new Error('Close other app tabs to upgrade workspace storage', { cause: error });
			throw error;
		});
	}
}

/** Weak persisted values are parsed by repository readers before leaving this boundary. */
export const storedTable = (transaction: Transaction, name: string): Table<unknown, IDBValidKey> =>
	transaction.table<unknown, IDBValidKey>(name);
