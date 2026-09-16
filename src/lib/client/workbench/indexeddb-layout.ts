import { workbenchLayoutSchema, type WorkbenchLayoutRecord } from '$lib/models/workbench';
export type { WorkbenchLayoutRecord } from '$lib/models/workbench';

const STORE_NAME = 'workspace';
const RECORD_KEY = 'current';

/**
 * IndexedDB structured-clones values at `put`. Workbench arrays originate in
 * Svelte `$state`, whose proxies are not cloneable; copying the three arrays is
 * the complete protocol adaptation because every member is a primitive tab id.
 */
const storedRecord = (record: WorkbenchLayoutRecord): WorkbenchLayoutRecord => ({
	...record,
	openTabs: [...record.openTabs],
	pinnedTabs: [...record.pinnedTabs],
	recentlyUsed: [...record.recentlyUsed]
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});

export class IndexedDbWorkbenchLayout {
	private database?: Promise<IDBDatabase>;
	private connection?: IDBDatabase;
	private closed = false;
	readonly databaseName: string;

	constructor(accountId: string, prefix = 'followthrough-workbench') {
		if (!accountId) throw new Error('An account is required to store workbench tabs');
		this.databaseName = `${prefix}:${encodeURIComponent(accountId)}`;
	}

	async get(): Promise<WorkbenchLayoutRecord | undefined> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readonly');
		const done = transactionDone(transaction);
		const stored = await requestResult<unknown>(
			transaction.objectStore(STORE_NAME).get(RECORD_KEY)
		);
		await done;
		if (this.closed) throw new Error('Workbench storage is closed');
		if (stored === undefined) return undefined;
		const parsed = workbenchLayoutSchema.safeParse(stored);
		if (!parsed.success)
			throw new Error(
				'Saved tabs could not be read. The stored layout was retained; open notes from the sidebar to rebuild the working set.'
			);
		return parsed.data;
	}

	async put(record: WorkbenchLayoutRecord): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).put(storedRecord(record));
		await transactionDone(transaction);
	}

	async clear(): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
		await transactionDone(transaction);
	}

	close(): void {
		this.closed = true;
		this.connection?.close();
	}

	private open(): Promise<IDBDatabase> {
		if (this.closed) return Promise.reject(new Error('Workbench storage is closed'));
		this.database ??= new Promise((resolve, reject) => {
			if (typeof indexedDB === 'undefined') {
				reject(new Error('Device storage is unavailable'));
				return;
			}
			const request = indexedDB.open(this.databaseName, 1);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					database.createObjectStore(STORE_NAME, { keyPath: 'id' });
				}
			};
			request.onsuccess = () => {
				if (this.closed) {
					request.result.close();
					reject(new Error('Workbench storage is closed'));
					return;
				}
				request.result.onversionchange = () => {
					this.close();
				};
				this.connection = request.result;
				resolve(request.result);
			};
			request.onerror = () => reject(request.error ?? new Error('Could not open device storage'));
			request.onblocked = () => reject(new Error('Device storage upgrade is blocked'));
		});
		return this.database;
	}
}
