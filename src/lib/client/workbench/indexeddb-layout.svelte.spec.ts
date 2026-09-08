import { afterEach, describe, expect, it } from 'vitest';
import { readLegacyNoteImports } from '$lib/client/sync/legacy-notes';
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
	const databaseName = `followthrough-workspace-test-${crypto.randomUUID()}`;
	databases.push(databaseName);
	return { databaseName, repository: new IndexedDbWorkbenchLayout(databaseName) };
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

describe('IndexedDB workspace storage', () => {
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
		const { databaseName, repository: first } = setup();
		const original = record();
		await first.put(original);
		first.close();
		const second = new IndexedDbWorkbenchLayout(databaseName);
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

	it('retains the shell layout while reading migrated note drafts', async () => {
		const { databaseName, repository } = setup();
		await repository.put(record());
		await readLegacyNoteImports('00000000-0000-4000-8000-000000000099', databaseName);
		const stored = await repository.get();
		repository.close();
		expect(stored).toEqual(record());
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
