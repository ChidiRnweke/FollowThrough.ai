import { afterEach, describe, expect, it } from 'vitest';
import { noteEtag } from '$lib/models/notes';
import type { LegacyNoteSyncRecord } from '$lib/models/workspace-mutations';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { seedLegacyNoteStorage } from '$lib/testing/sync/fixtures/legacy-note-storage';
import { completed, requestValue } from './database';
import { readLegacyNoteImports } from './legacy-notes';
const databases = new Set<string>();
const pending = (account = 1): LegacyNoteSyncRecord => {
	const base = noteBuilder({ userId: testActor(account).userId });
	return {
		userId: base.userId,
		noteId: base.id,
		base: { note: base, etag: noteEtag(base) },
		local: { ...base, plainText: 'Offline edit' },
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: base.updatedAt
	};
};
const seed = async (records: readonly LegacyNoteSyncRecord[]) => {
	const name = `legacy-import-test-${crypto.randomUUID()}`;
	databases.add(name);
	await seedLegacyNoteStorage(name, records);
	return name;
};
afterEach(async () => {
	for (const name of databases) await requestValue(indexedDB.deleteDatabase(name));
	databases.clear();
});
describe('legacy note storage migration', () => {
	it('reads only drafts belonging to the active account', async () => {
		const alice = pending();
		const name = await seed([alice, pending(2)]);
		expect(
			(await readLegacyNoteImports(alice.userId, name)).map((item) => item.draft.local)
		).toEqual([{ type: 'notes', value: alice.local }]);
	});
	it('leaves the original records available after reading the import', async () => {
		const original = pending();
		const name = await seed([original]);
		await readLegacyNoteImports(original.userId, name);
		const database = await requestValue(indexedDB.open(name, 3));
		const transaction = database.transaction('note-sync-records', 'readonly');
		const done = completed(transaction);
		const rows = await requestValue(transaction.objectStore('note-sync-records').getAll());
		await done;
		database.close();
		expect(rows).toEqual([{ key: `${original.userId}:${original.noteId}`, record: original }]);
	});
	it('preserves all three copies of an existing conflict without inventing sync validators', async () => {
		const original = pending();
		const remote = noteBuilder({ plainText: 'Other client', currentRevision: 2 });
		const name = await seed([
			{ ...original, state: 'conflict', remote: { note: remote, etag: noteEtag(remote) } }
		]);
		const [imported] = await readLegacyNoteImports(original.userId, name);
		expect({
			base: imported.draft.base,
			local: imported.draft.local,
			conflict: imported.conflict
		}).toEqual({
			base: { etag: null, value: { type: 'notes', value: original.base.note } },
			local: { type: 'notes', value: original.local },
			conflict: { kind: 'found', snapshot: { etag: null, value: { type: 'notes', value: remote } } }
		});
	});
	it('prevents the old writer reopening after the upgrade', async () => {
		const original = pending();
		const name = await seed([original]);
		await readLegacyNoteImports(original.userId, name);
		await expect(requestValue(indexedDB.open(name, 2))).rejects.toMatchObject({
			name: 'VersionError'
		});
	});
});
