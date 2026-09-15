import { Dexie, type Table, type Transaction, type TransactionMode } from 'dexie';
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
		transaction.onerror = transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});

export const accountDatabaseName = (accountId: string, prefix = 'followthrough-workspace-sync') =>
	`${prefix}:${encodeURIComponent(accountId)}`;
export class WorkspaceStorageError extends Error {}
export const storedResourceSchema = <T>(value: z.ZodType<T>) =>
	z.object({ key: z.string().min(1), entry: resourceStateSchema(value) });

/** One account, one connection lifetime. Closed instances can never reopen after reset. */
export class WorkspaceDatabase extends Dexie {
	readonly lifetime = new AbortController();
	private opening: Promise<void> | null = null;
	constructor(
		readonly accountId: string,
		prefix = 'followthrough-workspace-sync'
	) {
		super(accountDatabaseName(accountId, prefix), { autoOpen: false });
		this.version(1).stores({
			records: 'key',
			outbox: '++sequence, &intent.operationId, intent.key',
			receipts: 'key',
			meta: 'key'
		});
		this.on('versionchange', () => {
			this.stop(
				new WorkspaceStorageError('Workspace storage changed in another tab. Reload this tab.')
			);
			// Suppress Dexie's default handler, which would re-enable automatic reopening.
			return false;
		});
	}
	async ready(): Promise<void> {
		this.lifetime.signal.throwIfAborted();
		this.opening ??= super.open().then(() => undefined);
		await this.opening;
		this.lifetime.signal.throwIfAborted();
	}
	assertAccount(accountId: string): void {
		if (accountId !== this.accountId) throw new Error('This storage belongs to another account');
	}
	async run<T>(
		mode: TransactionMode,
		tables: readonly string[],
		work: (transaction: Transaction) => Promise<T>
	): Promise<T> {
		await this.ready();
		try {
			return await this.transaction(mode, [...tables], async (tx) => work(tx));
		} catch (error) {
			if (error instanceof z.ZodError || error instanceof WorkspaceStorageError) {
				const failure = new WorkspaceStorageError(
					'Saved workspace data could not be read. Export a copy before resetting this account on this device.',
					{ cause: error }
				);
				this.stop(failure);
				throw failure;
			}
			throw error;
		}
	}
	stop(reason: Error = new Error('This account is no longer active')): void {
		this.lifetime.abort(reason);
		super.close({ disableAutoOpen: true });
	}
	override close(): void {
		this.stop();
	}
}

/** Weak persisted values are parsed only by repository readers. */
export const storedTable = (transaction: Transaction, name: string): Table<unknown, IDBValidKey> =>
	transaction.table<unknown, IDBValidKey>(name);
