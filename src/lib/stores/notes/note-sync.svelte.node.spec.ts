import { describe, expect, it } from 'vitest';
import { noteEtag } from '$lib/models/notes';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncCache } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import { NoteSyncStore } from './note-sync.svelte';
const setup = async () => {
	const note = noteBuilder({ plainText: 'Original' });
	const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>();
	const transport = new InMemoryNoteWrites();
	const snapshot = { etag: syncEtag(1n), value: { type: 'notes' as const, value: note } };
	transport.records.set(key, snapshot);
	const cache = new ResourceCache(note.userId, { repository, transport });
	const writes = new MutationQueue(note.userId, {
		repository: outbox,
		transport,
		writerLock: new InMemoryAccountWriterLock(),
		resolveBase: async () => {
			throw new Error('No imported bases in this fixture');
		},
		received: async (key, resource) =>
			cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource)
	});
	const resources = new WorkspaceResources(note.userId, {
		cache,
		writes,
		restoreLocalWrites: async () => undefined
	});
	resources.setOnline(false);
	await cache.accept(key, snapshot);
	const store = new NoteSyncStore(async () => resources);
	return { note, key, cache, repository, outbox, transport, resources, store };
};
describe('note editor using shared resource writes', () => {
	it('opens an existing cached note while offline', async () => {
		const { note, store } = await setup();
		const version = $state({ note, etag: noteEtag(note) });
		const local = await store.initialize(version);
		expect({ local, status: store.status }).toEqual({ local: note, status: 'synced' });
	});
	it('persists typing in the shared outbox before reporting a local save', async () => {
		const { note, store, outbox } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		await store.save({ ...note, plainText: 'Offline draft' });
		expect((await outbox.list(note.userId))[0].intent.local).toEqual({
			type: 'notes',
			value: { ...note, plainText: 'Offline draft' }
		});
	});
	it('keeps the first observed base while unsent typing coalesces', async () => {
		const { note, store, outbox } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		await store.save({ ...note, plainText: 'First edit' });
		await store.save({ ...note, plainText: 'Later edit' });
		expect(
			(await outbox.list(note.userId)).map((entry) => ({
				base: entry.intent.base?.etag,
				local: entry.intent.local
			}))
		).toEqual([
			{ base: syncEtag(1n), local: { type: 'notes', value: { ...note, plainText: 'Later edit' } } }
		]);
	});
	it('keeps unsaved text recoverable when device storage rejects a save', async () => {
		const { note, store, outbox } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		outbox.appendFailure = 'Device full';
		expect({
			result: await store.save({ ...note, plainText: 'Keep this text' }),
			status: store.status,
			error: store.lastError
		}).toEqual({ result: undefined, status: 'error', error: 'Device full' });
	});
	it('preserves a conflicting draft when another client changes the observed version', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.save({ ...note, plainText: 'My edit' });
		resources.setOnline(true);
		await store.retry();
		expect(store.conflict).toEqual({
			base: note,
			local: { ...note, plainText: 'My edit' },
			remote: { kind: 'found', note: { ...note, plainText: 'Other client' } }
		});
	});
	it('adopts an acknowledgement before submitting later typing from the same editor', async () => {
		const { note, store, resources, transport, key } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		await store.save({ ...note, plainText: 'First edit' });
		resources.setOnline(true);
		await resources.synchronize();
		await store.save({ ...note, plainText: 'Later typing' });
		await resources.synchronize();
		expect({ status: store.status, saved: transport.records.get(key)?.value }).toEqual({
			status: 'synced',
			saved: { type: 'notes', value: { ...note, plainText: 'Later typing', currentRevision: 3 } }
		});
	});
});

describe('shared note conflict decisions', () => {
	it('does not resubmit a conflict when retrying synchronization', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		const remote = { ...note, plainText: 'Other client' };
		transport.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.save({ ...note, plainText: 'My edit' });
		resources.setOnline(true);
		await store.retry();
		await store.retry();
		expect({ status: store.status, remote: transport.records.get(key)?.value }).toEqual({
			status: 'conflict',
			remote: { type: 'notes', value: remote }
		});
	});
	it('keeps later typing when the original conflicting edit is explicitly retained', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.save({ ...note, plainText: 'My edit' });
		resources.setOnline(true);
		await store.retry();
		await store.save({ ...note, plainText: 'More typing' });
		await store.keepLocal();
		expect({ pending: resources.pending, text: store.record?.local.plainText }).toEqual({
			pending: [],
			text: 'More typing'
		});
	});
	it('uses the authoritative server copy after the reviewed local edits are discarded', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.initialize({ note, etag: noteEtag(note) });
		const remote = { ...note, plainText: 'Other client' };
		transport.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.save({ ...note, plainText: 'My edit' });
		resources.setOnline(true);
		await store.retry();
		const chosen = await store.useRemote();
		expect({ pending: resources.pending, chosen }).toEqual({ pending: [], chosen: remote });
	});
});
