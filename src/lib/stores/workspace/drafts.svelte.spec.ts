import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { noteCommand } from '$lib/services/workspace/commands';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAccountWriterLock } from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { DexieWorkspaceRepository } from '$lib/client/sync/workspace-local-repository';
import { requestValue } from '$lib/client/sync/database';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
const cleanups: (() => Promise<void>)[] = [];
const setup = async () => {
	const newName = `editor-new-${crypto.randomUUID()}`;
	const note = noteBuilder({ plainText: 'Original' });
	const local = { ...note, plainText: 'Offline draft' };
	const outbox = new DexieWorkspaceRepository(
		note.userId,
		workspaceCommandSchema,
		workspaceRecordSchema,
		newName
	);
	const repository = outbox.cache;
	const transport = new InMemoryNoteWrites();
	const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
	transport.records.set(key, { etag: syncEtag(1n), value: { type: 'notes', value: note } });
	await outbox.append(note.userId, {
		operationId: crypto.randomUUID(),
		key,
		command: noteCommand(local),
		local: { type: 'notes', value: local },
		base: { etag: syncEtag(1n), value: { type: 'notes', value: note } },
		basedOn: null,
		coalesce: 'document',
		references: []
	});
	const cache = new ResourceCache(note.userId, {
		transport,
		repository: {
			load: async (accountId) => (await outbox.read(accountId)).cache,
			commit: (accountId, changes) => repository.commit(accountId, changes)
		}
	});
	const writes = new MutationQueue(note.userId, {
		repository: outbox,
		transport,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		pull: () => cache.refresh()
	});
	const resources = new WorkspaceResources(note.userId, {
		repository: outbox,
		cache,
		writes
	});
	const unsubscribe = outbox.observe(
		note.userId,
		(state) => resources.applyLocal(state),
		(error) => {
			throw error;
		}
	);
	resources.setOnline(false);
	const store = resources.draft({ type: 'notes', id: [note.id] });
	cleanups.push(async () => {
		unsubscribe();
		resources.stop();
		await repository.close();
		await outbox.close();
		await requestValue(indexedDB.deleteDatabase(outbox.database.name));
	});
	return { note, local, key, transport, resources, store, outbox };
};
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
describe('durable offline drafts opened by the shared editor', () => {
	it('opens a durable offline draft before any authoritative resource has been downloaded', async () => {
		const { local, store } = await setup();
		const opened = await store.read();
		expect({ opened, status: store.status }).toEqual({
			opened: { kind: 'ready', value: local },
			status: 'pending'
		});
	});
	it('submits a durable offline draft when reconnected', async () => {
		const { note, key, store, resources, transport, outbox } = await setup();
		await store.read();
		resources.setOnline(true);
		await store.retry();
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
	await expect
		.poll(() => ({ status: store.status, retained: store.value?.plainText }))
		.toEqual({
			status: 'error',
			retained: local.plainText
		});
});

it('recognizes a durable acknowledgement from another writer while this tab remains offline', async () => {
	const { store, resources, outbox, note, transport } = await setup();
	await store.read();
	const sent = await outbox.take(note.userId);
	if (!sent || !sent.intent.base?.etag) throw new Error('The persisted edit must retain its base');
	const result = await transport.send({
		operationId: sent.intent.operationId,
		baseEtag: sent.intent.base.etag,
		command: sent.intent.command
	});
	await outbox.settle(note.userId, sent, result);
	await resources.synchronize();
	await expect.poll(() => store.status).toBe('synced');
});
