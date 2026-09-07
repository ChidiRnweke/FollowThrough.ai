import { afterEach, describe, expect, it } from 'vitest';
import { noteEtag, type NoteSyncRecord } from '$lib/models/notes';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import { workspaceCommandSchema, resolveImportedNoteBase } from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAccountWriterLock } from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { IndexedDbNoteSyncRepository } from '$lib/client/notes/sync/indexeddb-note-sync-repository';
import { IndexedDbSyncCache } from '$lib/client/sync/indexeddb-cache';
import { IndexedDbOutbox } from '$lib/client/sync/indexeddb-outbox';
import { migrateLegacyNotes } from '$lib/client/sync/legacy-notes';
import { requestValue } from '$lib/client/sync/database';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import { NoteSyncStore } from './note-sync.svelte';
const cleanups: (() => Promise<void>)[] = [];
const setup = async () => {
	const oldName = `editor-old-${crypto.randomUUID()}`;
	const newName = `editor-new-${crypto.randomUUID()}`;
	const note = noteBuilder({ plainText: 'Original' });
	const local = { ...note, plainText: 'Offline draft' };
	const old = new IndexedDbNoteSyncRepository(oldName);
	const record: NoteSyncRecord = {
		userId: note.userId,
		noteId: note.id,
		base: { note, etag: noteEtag(note) },
		local,
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: note.updatedAt
	};
	await old.put(record);
	old.close();
	const repository = new IndexedDbSyncCache(workspaceRecordSchema, newName);
	const outbox = new IndexedDbOutbox(workspaceCommandSchema, workspaceRecordSchema, newName);
	const transport = new InMemoryNoteWrites();
	const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
	transport.records.set(key, { etag: syncEtag(1n), value: { type: 'notes', value: note } });
	const cache = new ResourceCache(note.userId, { repository, transport });
	const writes = new MutationQueue(note.userId, {
		repository: outbox,
		transport,
		writerLock: new InMemoryAccountWriterLock(),
		resolveBase: async (key, base, local) => {
			const remote = await transport.read(key, null);
			if (remote.kind === 'unchanged') throw new Error('Expected full base');
			return resolveImportedNoteBase(base, local, remote);
		},
		received: async (key, resource) =>
			cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource)
	});
	const resources = new WorkspaceResources(note.userId, {
		cache,
		writes,
		restoreLocalWrites: () => migrateLegacyNotes(note.userId, outbox, oldName)
	});
	resources.setOnline(false);
	const store = new NoteSyncStore(async () => resources);
	cleanups.push(async () => {
		resources.stop();
		await repository.close();
		await outbox.close();
		await requestValue(indexedDB.deleteDatabase(oldName));
		await requestValue(indexedDB.deleteDatabase(newName));
	});
	return { note, local, key, transport, resources, store, outbox, oldName };
};
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
describe('legacy drafts opened by the shared editor', () => {
	it('opens an imported offline draft before any authoritative resource has been downloaded', async () => {
		const { note, local, store } = await setup();
		const opened = await store.initialize({ note, etag: noteEtag(note) });
		expect({ opened, status: store.status }).toEqual({ opened: local, status: 'pending' });
	});
	it('validates and submits an imported draft without resurrecting it on the next upgrade attempt', async () => {
		const { note, key, store, resources, transport, outbox, oldName } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		resources.setOnline(true);
		await store.retry();
		await migrateLegacyNotes(note.userId, outbox, oldName);
		expect({
			pending: await outbox.list(note.userId),
			saved: transport.records.get(key)?.value
		}).toEqual({
			pending: [],
			saved: { type: 'notes', value: { ...note, plainText: 'Offline draft', currentRevision: 2 } }
		});
	});
});
