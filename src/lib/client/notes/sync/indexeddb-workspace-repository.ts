import type { NoteId } from '$lib/models/notes';

/**
 * Persisted workbench state.
 *
 * The URL is the canonical source of open tabs during a session (so Back /
 * Forward and deep links keep working), but a small companion record in the
 * same IndexedDB database that backs `NoteSyncRecord` is updated whenever the
 * user opens, closes, or reorders tabs.  On the next session the layout reads
 * this record to restore the working set.
 *
 * The repository is intentionally shape-compatible with the existing
 * `IndexedDbNoteSyncRepository` so that the testing conventions and lifecycle
 * match.
 */
export interface WorkspaceRecord {
	readonly id: 'current';
	readonly openTabs: readonly NoteId[];
	readonly focusedNoteId: NoteId | null;
	readonly pinnedTabs: readonly NoteId[];
	/** LRU ordering of recently-focused tabs, most-recent first. */
	readonly recentlyUsed: readonly NoteId[];
	/** Whether the user has collapsed the global tab strip.  Display preference. */
	readonly stripHidden: boolean;
	/**
	 * Width of the secondary (split) pane as a fraction of 1, used only when
	 * `splitNoteId` is active in the URL.  Display preference — the URL's
	 * `?split=` carries which note is split, while this number carries the
	 * ratio the user last preferred.  Missing on older records; treated as
	 * 0.5 (default) on read.
	 */
	readonly splitRatio: number;
}

const STORE_NAME = 'workspace';
const RECORD_KEY = 'current';

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

export class IndexedDbWorkspaceRepository {
	private database?: Promise<IDBDatabase>;

	constructor(private readonly databaseName = 'followthrough-note-sync') {}

	async get(): Promise<WorkspaceRecord | undefined> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readonly');
		const stored = await requestResult<WorkspaceRecord | undefined>(
			transaction.objectStore(STORE_NAME).get(RECORD_KEY)
		);
		await transactionDone(transaction);
		return stored;
	}

	async put(record: WorkspaceRecord): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).put(record);
		await transactionDone(transaction);
	}

	async clear(): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
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
			// Version 2 of the existing note-sync database: the new
			// `workspace` object store is created alongside the original
			// `note-sync-records` store.  Opening at v2 is a no-op for users
			// who have already upgraded to v1 of the database; we only add
			// the new store on upgrade.
			const request = indexedDB.open(this.databaseName, 2);
			request.onupgradeneeded = () => {
				const database = request.result;
				// Whichever repo triggers the v1→v2 upgrade owns the full
				// schema.  Keep both stores in sync so that opening either
				// repository first produces the same database layout.
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					database.createObjectStore(STORE_NAME, { keyPath: 'id' });
				}
				if (!database.objectStoreNames.contains('note-sync-records')) {
					database.createObjectStore('note-sync-records', { keyPath: 'key' });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('Could not open device storage'));
			request.onblocked = () => reject(new Error('Device storage upgrade is blocked'));
		});
		return this.database;
	}
}
