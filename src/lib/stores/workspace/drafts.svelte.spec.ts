import { afterEach, describe, expect, it } from 'vitest';
import { noteEtag } from '$lib/models/notes';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import {
	workspaceCommandSchema,
	resolveImportedNoteBase,
	type LegacyNoteSyncRecord
} from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAccountWriterLock } from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { seedLegacyNoteStorage } from '$lib/testing/sync/fixtures/legacy-note-storage';
import { IndexedDbSyncCache } from '$lib/client/sync/indexeddb-cache';
import { IndexedDbOutbox } from '$lib/client/sync/indexeddb-outbox';
import { migrateLegacyNotes } from '$lib/client/sync/legacy-notes';
import { requestValue } from '$lib/client/sync/database';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
const cleanups: (() => Promise<void>)[] = [];
const setup = async () => {
	const oldName = `editor-old-${crypto.randomUUID()}`;
	const newName = `editor-new-${crypto.randomUUID()}`;
	const note = noteBuilder({ plainText: 'Original' });
	const local = { ...note, plainText: 'Offline draft' };
	const record: LegacyNoteSyncRecord = {
		userId: note.userId,
		noteId: note.id,
		base: { note, etag: noteEtag(note) },
		local,
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'pending',
		updatedAt: note.updatedAt
	};
	await seedLegacyNoteStorage(oldName, [record]);
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
	const store = resources.draft({ type: 'notes', id: [note.id] });
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
		const { local, store } = await setup();
		const opened = await store.read();
		expect({ opened, status: store.status }).toEqual({
			opened: { kind: 'ready', value: local },
			status: 'pending'
		});
	});
	it('validates and submits an imported draft without resurrecting it on the next upgrade attempt', async () => {
		const { note, key, store, resources, transport, outbox, oldName } = await setup();
		await store.read();
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

it('does not label an editor buffer synced after its saved edit is discarded elsewhere', async () => {
	const { store, resources, local } = await setup();
	await store.read();
	await resources.discard(resources.pending.map((entry) => entry.intent.operationId));
	expect({ status: store.status, retained: store.value?.plainText }).toEqual({
		status: 'error',
		retained: local.plainText
	});
});

it('retains the editor buffer with an error after a discard committed outside this app instance', async () => {
	const { store, resources, local, outbox, note } = await setup();
	await store.read();
	await outbox.discard(
		note.userId,
		(await outbox.list(note.userId)).map((entry) => entry.intent.operationId)
	);
	await resources.synchronize();
	expect({ status: store.status, retained: store.value?.plainText }).toEqual({
		status: 'error',
		retained: local.plainText
	});
});

it('recognizes a durable acknowledgement from another writer while this tab remains offline', async () => {
	const { store, resources, outbox, note, transport, key } = await setup();
	await store.read();
	const remote = await transport.read(key, null);
	if (remote.kind !== 'found') throw new Error('The original server copy must exist');
	const pending = (await outbox.list(note.userId))[0];
	if (!pending) throw new Error('The imported edit must be queued');
	await outbox.resolveBase(note.userId, pending.intent.operationId, {
		kind: 'matched',
		snapshot: remote.snapshot
	});
	const sent = await outbox.take(note.userId);
	if (!sent || !sent.intent.base?.etag) throw new Error('The imported base must be validated');
	const result = await transport.send({
		operationId: sent.intent.operationId,
		baseEtag: sent.intent.base.etag,
		command: sent.intent.command
	});
	await outbox.settle(note.userId, sent, result);
	await resources.synchronize();
	expect(store.status).toBe('synced');
});
