import { Dexie, type Table, type Transaction } from 'dexie';
import { z } from 'zod';
import { resourceStateSchema } from '$lib/models/sync';

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

export const storedResourceSchema = <T>(accountId: string, value: z.ZodType<T>) =>
	z.object({
		accountId: z.literal(accountId),
		key: z.string().min(1),
		schemaVersion: z.literal(3),
		entry: resourceStateSchema(value)
	});

/** Native storage upgrades in place; version 2 closes tabs using the old cache shape. */
export class WorkspaceDatabase extends Dexie {
	private upgradeBlocked = false;
	constructor(name = 'followthrough-workspace-sync') {
		super(name);
		this.version(2).stores({
			'recovery-heads': 'accountId',
			quarantine: '[accountId+source+key], accountId',
			records: '[accountId+key], accountId',
			cursors: 'accountId',
			outbox: '[accountId+entry.sequence], accountId, &[accountId+entry.intent.operationId]',
			'write-receipts': '[accountId+key]',
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
