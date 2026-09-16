import { afterEach, describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { IndexedDbWorkbenchLayout, type WorkbenchLayoutRecord } from './indexeddb-layout';

const databases: string[] = [];

const deleteDatabase = (name: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('Could not delete test database'));
		request.onblocked = () => reject(new Error('Test database deletion was blocked'));
	});

const setup = () => {
	const prefix = `followthrough-workspace-test-${crypto.randomUUID()}`;
	const accountId = crypto.randomUUID();
	const repository = new IndexedDbWorkbenchLayout(accountId, prefix);
	const databaseName = repository.databaseName;
	databases.push(databaseName);
	return { databaseName, accountId, prefix, repository };
};

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;

const record = (overrides: Partial<WorkbenchLayoutRecord> = {}): WorkbenchLayoutRecord => ({
	id: 'current',
	openTabs: [id(1), id(2)],
	focusedNoteId: id(2),
	pinnedTabs: [id(1)],
	recentlyUsed: [id(2), id(1)],
	stripHidden: false,
	splitRatio: 0.5,
	...overrides
});

afterEach(async () => {
	for (const database of databases.splice(0)) await deleteDatabase(database);
});

const writeRaw = async (databaseName: string, value: object): Promise<void> => {
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(databaseName);
		request.onupgradeneeded = () =>
			request.result.createObjectStore('workspace', { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction('workspace', 'readwrite');
			transaction.objectStore('workspace').put(value);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} finally {
		database.close();
	}
};

describe('IndexedDB workspace storage', () => {
	it('retains the original row after reporting a corrupt layout', async () => {
		const { databaseName, repository } = setup();
		await repository.put(record());
		const corrupt = { ...record(), openTabs: ['not-a-tab'] };
		await writeRaw(databaseName, corrupt);
		const outcome = await repository.get().then(
			() => 'read',
			() => 'rejected'
		);
		repository.close();
		const stored = await new Promise<unknown>((resolve, reject) => {
			const request = indexedDB.open(databaseName);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const database = request.result;
				const read = database
					.transaction('workspace', 'readonly')
					.objectStore('workspace')
					.get('current');
				read.onsuccess = () => {
					database.close();
					resolve(read.result);
				};
				read.onerror = () => {
					database.close();
					reject(read.error);
				};
			};
		});
		expect({ outcome, stored }).toEqual({ outcome: 'rejected', stored: corrupt });
	});
	it('keeps layouts separate for accounts using the same device', async () => {
		const first = setup();
		const second = new IndexedDbWorkbenchLayout(crypto.randomUUID(), first.prefix);
		databases.push(second.databaseName);
		await first.repository.put(record());
		const stored = await second.get();
		first.repository.close();
		second.close();
		expect(stored).toBeUndefined();
	});
	it('keeps another account layout when one account clears its tabs', async () => {
		const first = setup();
		const second = new IndexedDbWorkbenchLayout(crypto.randomUUID(), first.prefix);
		databases.push(second.databaseName);
		await first.repository.put(record());
		await second.put(
			record({ openTabs: [id(3)], focusedNoteId: id(3), pinnedTabs: [], recentlyUsed: [id(3)] })
		);
		await first.repository.clear();
		const stored = await second.get();
		first.repository.close();
		second.close();
		expect(stored?.openTabs).toEqual([id(3)]);
	});
	it('does not adopt an old layout that has no recorded account owner', async () => {
		const { prefix, repository } = setup();
		databases.push(prefix);
		await writeRaw(prefix, record());
		const stored = await repository.get();
		repository.close();
		expect(stored).toBeUndefined();
	});
	it('rejects a stored layout with malformed tab identities', async () => {
		const { databaseName, repository } = setup();
		await repository.put(record());
		await writeRaw(databaseName, { ...record(), openTabs: ['not-a-tab'] });
		try {
			await expect(repository.get()).rejects.toThrow('Saved tabs could not be read');
		} finally {
			repository.close();
		}
	});
	it('rejects a stored layout with an invalid split ratio', async () => {
		const { databaseName, repository } = setup();
		await repository.put(record());
		await writeRaw(databaseName, { ...record(), splitRatio: 7 });
		try {
			await expect(repository.get()).rejects.toThrow('Saved tabs could not be read');
		} finally {
			repository.close();
		}
	});
	it('never reopens a closed account connection', async () => {
		const { repository } = setup();
		await repository.put(record());
		repository.close();
		await expect(repository.get()).rejects.toThrow('Workbench storage is closed');
	});
	it('round-trips a workspace record', async () => {
		const { repository } = setup();
		const original = record();
		await repository.put(original);
		const stored = await repository.get();
		repository.close();
		expect(stored).toEqual(original);
	});

	it('round-trips a workspace record that arrives as reactive state', async () => {
		const { repository } = setup();
		const original = record();
		const reactive = $state(original);
		await repository.put(reactive);
		const stored = await repository.get();
		repository.close();
		expect(stored).toEqual(original);
	});

	it('returns undefined when no record has been written', async () => {
		const { repository } = setup();
		const stored = await repository.get();
		repository.close();
		expect(stored).toBeUndefined();
	});

	it('overwrites the existing record on subsequent puts', async () => {
		const { repository } = setup();
		await repository.put(record({ focusedNoteId: id(1) }));
		await repository.put(record({ focusedNoteId: id(2) }));
		const stored = await repository.get();
		repository.close();
		expect(stored?.focusedNoteId).toBe(id(2));
	});

	it('survives a database reopen', async () => {
		const { accountId, prefix, repository: first } = setup();
		const original = record();
		await first.put(original);
		first.close();
		const second = new IndexedDbWorkbenchLayout(accountId, prefix);
		const stored = await second.get();
		second.close();
		expect(stored).toEqual(original);
	});

	it('clears the record when requested', async () => {
		const { repository } = setup();
		await repository.put(record());
		await repository.clear();
		const stored = await repository.get();
		repository.close();
		expect(stored).toBeUndefined();
	});

	it('round-trips a non-default split ratio', async () => {
		const { repository } = setup();
		const original = record({ splitRatio: 0.35 });
		await repository.put(original);
		const stored = await repository.get();
		repository.close();
		expect(stored?.splitRatio).toBe(0.35);
	});

	it('returns the stored record verbatim even when splitRatio is at the default 0.5', async () => {
		const { repository } = setup();
		await repository.put(record({ splitRatio: 0.5 }));
		const stored = await repository.get();
		repository.close();
		expect(stored?.splitRatio).toBe(0.5);
	});
});
