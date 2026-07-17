import type { NoteId, NoteSyncRecord, UserId } from '$lib/models';
import type { NoteSyncRepository } from './contracts';

const STORE_NAME = 'note-sync-records';

interface StoredRecord {
	readonly key: string;
	readonly record: NoteSyncRecord;
}

const recordKey = (userId: UserId, noteId: NoteId): string => `${userId}:${noteId}`;

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

export class IndexedDbNoteSyncRepository implements NoteSyncRepository {
	private database?: Promise<IDBDatabase>;

	constructor(private readonly databaseName = 'followthrough-note-sync') {}

	async get(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readonly');
		const stored = await requestResult<StoredRecord | undefined>(
			transaction.objectStore(STORE_NAME).get(recordKey(userId, noteId))
		);
		await transactionDone(transaction);
		return stored?.record;
	}

	async put(record: NoteSyncRecord): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).put({
			key: recordKey(record.userId, record.noteId),
			record
		} satisfies StoredRecord);
		await transactionDone(transaction);
	}

	async delete(userId: UserId, noteId: NoteId): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).delete(recordKey(userId, noteId));
		await transactionDone(transaction);
	}

	close(): void {
		void this.database?.then((database) => database.close());
		this.database = undefined;
	}

	private open(): Promise<IDBDatabase> {
		this.database ??= new Promise((resolve, reject) => {
			if (typeof indexedDB === 'undefined') {
				reject(new Error('Device storage is unavailable'));
				return;
			}
			const request = indexedDB.open(this.databaseName, 1);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(STORE_NAME))
					database.createObjectStore(STORE_NAME, { keyPath: 'key' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('Could not open device storage'));
			request.onblocked = () => reject(new Error('Device storage upgrade is blocked'));
		});
		return this.database;
	}
}
