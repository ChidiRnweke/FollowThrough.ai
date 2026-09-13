import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { describe, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { noteWrite, type WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncCache } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
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
		scheduler: new InMemorySyncScheduler(),
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
	const store = resources.draft({ type: 'notes', id: [note.id] });
	return { note, key, cache, repository, outbox, transport, resources, store };
};
describe('note editor using shared resource writes', () => {
	it('opens an existing cached note while offline', async () => {
		const { note, store } = await setup();
		const local = await store.read();
		expect({ local, status: store.status }).toEqual({
			local: { kind: 'ready', value: note },
			status: 'synced'
		});
	});
	it('persists typing in the shared outbox before reporting a local save', async () => {
		const { note, store, outbox } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'Offline draft' }));
		expect((await outbox.list(note.userId))[0].intent.local).toEqual({
			type: 'notes',
			value: { ...note, plainText: 'Offline draft' }
		});
	});
	it('keeps the first observed base while unsent typing coalesces', async () => {
		const { note, store, outbox } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'First edit' }));
		await store.stage(noteWrite({ ...note, plainText: 'Later edit' }));
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
		await store.read();
		outbox.appendFailure = 'Device full';
		expect({
			result: await store.stage(noteWrite({ ...note, plainText: 'Keep this text' })),
			status: store.status,
			error: store.lastError
		}).toEqual({
			result: { kind: 'failure', message: 'Device full' },
			status: 'error',
			error: 'Device full'
		});
	});
	it('preserves a conflicting draft when another client changes the observed version', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.read();
		transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		expect(store.conflict).toEqual({
			base: note,
			local: { ...note, plainText: 'My edit' },
			remote: { kind: 'found', value: { ...note, plainText: 'Other client' } }
		});
	});
	it('adopts an acknowledgement before submitting later typing from the same editor', async () => {
		const { note, store, resources, transport, key } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		await store.stage(noteWrite({ ...note, plainText: 'Later typing' }));
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
		await store.read();
		const remote = { ...note, plainText: 'Other client' };
		transport.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
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
		await store.read();
		transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		await store.stage(noteWrite({ ...note, plainText: 'More typing' }));
		await store.keep();
		expect({ pending: resources.pending, text: store.value?.plainText }).toEqual({
			pending: [],
			text: 'More typing'
		});
	});
	it('uses the authoritative server copy after the reviewed local edits are discarded', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.read();
		const remote = { ...note, plainText: 'Other client' };
		transport.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		const chosen = await store.discard();
		expect({ pending: resources.pending, chosen }).toEqual({
			pending: [],
			chosen: { kind: 'ready', value: remote }
		});
	});
});

describe('shared draft identity and resource semantics', () => {
	it('edits projects through the same durable draft path', async () => {
		const { resources, cache, outbox, note } = await setup();
		const project = projectBuilder();
		const identity = { type: 'projects', id: [project.id] } satisfies WorkspaceResourceIdentity;
		await cache.accept(workspaceResourceKey(identity), {
			etag: syncEtag(3n),
			value: { type: 'projects', value: project }
		});
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage({
			command: { kind: 'renameProject', projectId: project.id, name: 'Offline name' },
			local: { type: 'projects', value: { ...project, name: 'Offline name' } },
			coalesce: 'name',
			references: []
		});
		expect({
			value: draft.value?.name,
			status: draft.status,
			base: (await outbox.list(note.userId))[0].intent.base?.etag
		}).toEqual({ value: 'Offline name', status: 'pending', base: syncEtag(3n) });
	});
	it('rejects a command addressed to a different resource before persisting it', async () => {
		const { store, note, resources } = await setup();
		await store.read();
		const result = await store.stage(noteWrite({ ...note, id: testNoteId(2) }));
		expect({ result, pending: resources.pending }).toEqual({
			result: { kind: 'failure', message: 'The edit belongs to a different resource' },
			pending: []
		});
	});
});

describe('a rendered form base', () => {
	it('retains the displayed version when synchronization updates the cache during typing', async () => {
		const { store, cache, key, note, resources } = await setup();
		store.capture();
		await cache.accept(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteWrite({ ...note, plainText: 'Still typing' }));
		expect(resources.pending[0].intent.base?.etag).toBe(syncEtag(1n));
	});
});

describe('a mounted editor after acknowledgement', () => {
	it('preserves later typing as a normal conflict when another surface supersedes its receipt', async () => {
		const { note, store, resources } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const other = resources.draft({ type: 'notes', id: [note.id] });
		await other.read();
		const current = other.value;
		if (!current) throw new Error('The saved note must exist');
		await other.stage(noteWrite({ ...current, plainText: 'Other surface' }));
		await resources.synchronize();
		await store.stage(noteWrite({ ...note, plainText: 'My later typing' }));
		await resources.synchronize();
		expect({
			status: store.status,
			local: store.conflict?.local?.plainText,
			remote: store.conflict?.remote
		}).toEqual({
			status: 'conflict',
			local: 'My later typing',
			remote: {
				kind: 'found',
				value: { ...current, plainText: 'Other surface', currentRevision: 3 }
			}
		});
	});
	it('never automatically resurrects an edit discarded by another surface', async () => {
		const { note, store, resources, transport, key } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'Discarded edit' }));
		await resources.discard(resources.pending.map((entry) => entry.intent.operationId));
		await store.stage(noteWrite({ ...note, plainText: 'Keep my buffer' }));
		resources.setOnline(true);
		await resources.synchronize();
		expect({
			status: store.status,
			local: store.value?.plainText,
			server: transport.records.get(key)?.value
		}).toEqual({
			status: 'conflict',
			local: 'Keep my buffer',
			server: { type: 'notes', value: note }
		});
	});
	it('conflicts with a later server revision even when that revision has identical editor content', async () => {
		const { note, key, store, transport, resources, cache } = await setup();
		await store.read();
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const changed = {
			etag: syncEtag(3n),
			value: {
				type: 'notes' as const,
				value: { ...note, plainText: 'My edit', currentRevision: 3 }
			}
		};
		transport.records.set(key, changed);
		await cache.accept(key, changed);
		await store.stage(noteWrite({ ...note, plainText: 'Later typing' }));
		await resources.synchronize();
		expect(store.status).toBe('conflict');
	});
	it('can save again after explicitly keeping its conflicting write', async () => {
		const { note, key, store, transport, resources } = await setup();
		await store.read();
		transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteWrite({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		await store.keep();
		await store.stage(noteWrite({ ...note, plainText: 'After explicit keep' }));
		await resources.synchronize();
		expect(store.status).toBe('synced');
	});
});

it('coalesces overlapping local saves using their serialized observed ancestry', async () => {
	const { note, store, resources } = await setup();
	await store.read();
	await Promise.all([
		store.stage(noteWrite({ ...note, plainText: 'First' })),
		store.stage(noteWrite({ ...note, plainText: 'Second' }))
	]);
	expect(resources.pending.map((entry) => entry.intent.local)).toEqual([
		{ type: 'notes', value: { ...note, plainText: 'Second' } }
	]);
});

// SYNC-DECISION: discard never authorizes submission.
it('discards a queued edit without changing the authoritative note after reconnecting', async () => {
	const { note, key, store, transport, resources } = await setup();
	await store.read();
	await store.stage(noteWrite({ ...note, plainText: 'Do not submit this' }));
	await resources.synchronize();
	resources.setOnline(true);
	const outcome = await store.discard().then(
		(value) => ({ kind: 'discarded', value }),
		(error) => ({ kind: 'failure', message: String(error) })
	);
	expect({
		outcome,
		authoritative: transport.records.get(key)?.value,
		pending: resources.pending
	}).toEqual({
		outcome: { kind: 'discarded', value: { kind: 'ready', value: note } },
		authoritative: { type: 'notes', value: note },
		pending: []
	});
});
