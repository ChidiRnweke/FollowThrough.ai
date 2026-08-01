import { afterEach, describe, expect, it } from 'vitest';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { noteEtag, type NoteSyncRecord } from '$lib/models/notes';
import { IndexedDbNoteSyncRepository } from './indexeddb-note-sync-repository';

const databases: string[] = [];

const deleteDatabase = (name: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('Could not delete test database'));
		request.onblocked = () => reject(new Error('Test database deletion was blocked'));
	});

const setup = () => {
	const databaseName = `followthrough-note-sync-test-${crypto.randomUUID()}`;
	databases.push(databaseName);
	return { databaseName, repository: new IndexedDbNoteSyncRepository(databaseName) };
};

const record = (plainText = 'Local'): NoteSyncRecord => {
	const base = noteBuilder();
	return {
		userId: base.userId,
		noteId: base.id,
		base: { note: base, etag: noteEtag(base) },
		local: { ...base, plainText },
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: base.updatedAt
	};
};

afterEach(async () => {
	for (const database of databases.splice(0)) await deleteDatabase(database);
});

describe('IndexedDB note synchronization storage', () => {
	it('round-trips a pending rich note record', async () => {
		const { repository } = setup();
		const pending = record();
		await repository.put(pending);
		const stored = await repository.get(pending.userId, pending.noteId);
		repository.close();
		expect(stored).toEqual(pending);
	});

	// A record reaching this store from a component arrives wrapped in Svelte's
	// reactive proxy, and `IDBObjectStore.put` structured-clones what it is given
	// — which throws `DataCloneError` on a proxy and used to break note saving
	// until the page was closed.
	it('round-trips a record that arrives as reactive state', async () => {
		const { repository } = setup();
		const pending = record();
		const reactive = $state(pending);
		await repository.put(reactive);
		const stored = await repository.get(pending.userId, pending.noteId);
		repository.close();
		expect(stored?.base.note.document).toEqual(pending.base.note.document);
	});

	it('partitions records by user identity', async () => {
		const { repository } = setup();
		const pending = record();
		await repository.put(pending);
		const stored = await repository.get(testActor(2).userId, pending.noteId);
		repository.close();
		expect(stored).toBeUndefined();
	});

	it('retains pending work after the database is reopened', async () => {
		const { databaseName, repository: first } = setup();
		const pending = record('Persisted');
		await first.put(pending);
		first.close();
		const second = new IndexedDbNoteSyncRepository(databaseName);
		const stored = await second.get(pending.userId, pending.noteId);
		second.close();
		expect(stored?.local.plainText).toBe('Persisted');
	});
});
