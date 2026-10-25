import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { NoteRevisionId } from '$lib/models/notes';
import { syncEtag, type SyncSnapshot } from '$lib/models/sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { InMemoryWorkspaceTransport } from '$lib/testing/workspace/fakes/in-memory-transport';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const { noteCommand, workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

/** One note saved at version 1 on the server and on this device; the tab starts offline. */
const setup = async () => {
	const note = noteBuilder({ plainText: 'Original' });
	const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
	const server = new InMemoryNoteWrites();
	const fixture = workspaceFixture({
		accountId: note.userId,
		transport: new InMemoryWorkspaceTransport(server)
	});
	started.push(fixture.workspace);
	const snapshot = { etag: syncEtag(1n), value: { type: 'notes' as const, value: note } };
	server.records.set(key, snapshot);
	fixture.replica.seed(note.userId, [{ key, entry: { kind: 'present', snapshot } }]);
	const resources = await fixture.start(false);
	const store = resources.draft({ type: 'notes', id: [note.id] });
	/** Another tab or a background page stored a version on this device. */
	const accept = async (stored: SyncSnapshot<WorkspaceRecord>) => {
		fixture.replica.seed(note.userId, [{ key, entry: { kind: 'present', snapshot: stored } }]);
		await fixture.replica.read(note.userId);
	};
	const queued = () => fixture.replica.entries(note.userId);
	return { ...fixture, note, key, server, resources, store, accept, queued };
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
		const { note, store, queued } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'Offline draft' }));
		expect(queued()[0]?.intent.local).toEqual({
			type: 'notes',
			value: { ...note, plainText: 'Offline draft', updatedAt: expect.any(String) }
		});
	});
	it('keeps the first observed base while unsent typing coalesces', async () => {
		const { note, store, queued } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'First edit' }));
		await store.stage(noteCommand({ ...note, plainText: 'Later edit' }));
		expect(
			queued().map((entry) => ({ base: entry.intent.base?.etag, local: entry.intent.local }))
		).toEqual([
			{
				base: syncEtag(1n),
				local: {
					type: 'notes',
					value: { ...note, plainText: 'Later edit', updatedAt: expect.any(String) }
				}
			}
		]);
	});
	it('keeps unsaved text recoverable when device storage rejects a save', async () => {
		const { note, key, store, replica } = await setup();
		await store.read();
		replica.transactionFailures.set(key, 'Device full');
		expect({
			result: await store.stage(noteCommand({ ...note, plainText: 'Keep this text' })),
			status: store.status,
			error: store.lastError
		}).toEqual({
			result: { kind: 'failure', message: 'Device full' },
			status: 'error',
			error: 'Device full'
		});
	});
	it('preserves a conflicting draft when another client changes the observed version', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		server.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		expect(store.conflict).toEqual({
			base: note,
			local: { ...note, plainText: 'My edit', updatedAt: expect.any(String) },
			remote: { kind: 'found', value: { ...note, plainText: 'Other client' } }
		});
	});
	it('adopts an acknowledgement before submitting later typing from the same editor', async () => {
		const { note, store, resources, server, key } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		await store.stage(noteCommand({ ...note, plainText: 'Later typing' }));
		await resources.synchronize();
		expect({ status: store.status, saved: server.records.get(key)?.value }).toEqual({
			status: 'synced',
			saved: { type: 'notes', value: { ...note, plainText: 'Later typing', currentRevision: 3 } }
		});
	});
});

describe('the revision a selection action names', () => {
	it('is the server revision after an acknowledged save, not the one the editor observed', async () => {
		const { note, store, resources } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'Edited' }));
		resources.setOnline(true);
		await resources.synchronize();
		expect({
			status: store.status,
			editor: store.value?.currentRevision,
			confirmed: store.confirmed?.currentRevision
		}).toEqual({ status: 'synced', editor: 1, confirmed: 2 });
	});
});

describe('shared note conflict decisions', () => {
	it('does not resubmit a conflict when retrying synchronization', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		const remote = { ...note, plainText: 'Other client' };
		server.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		await store.retry();
		expect({ status: store.status, remote: server.records.get(key)?.value }).toEqual({
			status: 'conflict',
			remote: { type: 'notes', value: remote }
		});
	});
	it('keeps later typing when the original conflicting edit is explicitly retained', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		server.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await store.retry();
		await store.stage(noteCommand({ ...note, plainText: 'More typing' }));
		await store.keep();
		await resources.synchronize();
		expect({ pending: resources.pending, text: store.value?.plainText }).toEqual({
			pending: [],
			text: 'More typing'
		});
	});
	it('uses the authoritative server copy after the reviewed local edits are discarded', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		const remote = { ...note, plainText: 'Other client' };
		server.records.set(key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
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
		const { resources, replica, note, queued } = await setup();
		const project = projectBuilder();
		const identity = { type: 'projects' as const, id: [project.id] as [string] };
		replica.seed(note.userId, [
			{
				key: workspaceResourceKey(identity),
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(3n), value: { type: 'projects', value: project } }
				}
			}
		]);
		await replica.read(note.userId);
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage({ kind: 'renameProject', projectId: project.id, name: 'Offline name' });
		expect({
			value: draft.value?.name,
			status: draft.status,
			base: queued()[0]?.intent.base?.etag
		}).toEqual({ value: 'Offline name', status: 'pending', base: syncEtag(3n) });
	});
	it('rejects a command addressed to a different resource before persisting it', async () => {
		const { store, note, resources } = await setup();
		await store.read();
		const result = await store.stage(noteCommand({ ...note, id: testNoteId(2) }));
		expect({ result, pending: resources.pending }).toEqual({
			result: { kind: 'failure', message: 'The edit belongs to a different resource' },
			pending: []
		});
	});
});

describe('a rendered form base', () => {
	it('retains the displayed version when synchronization updates the cache during typing', async () => {
		const { store, accept, note, resources } = await setup();
		store.capture();
		await accept({
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteCommand({ ...note, plainText: 'Still typing' }));
		expect(resources.pending[0]?.intent.base?.etag).toBe(syncEtag(1n));
	});
});

describe('a mounted editor after acknowledgement', () => {
	it('preserves later typing as a normal conflict when another surface supersedes its receipt', async () => {
		const { note, store, resources } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const other = resources.draft({ type: 'notes', id: [note.id] });
		await other.read();
		const current = other.value;
		if (!current) throw new Error('The saved note must exist');
		await other.stage(noteCommand({ ...current, plainText: 'Other surface' }));
		await resources.synchronize();
		await store.stage(noteCommand({ ...note, plainText: 'My later typing' }));
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
	it('rebases later typing onto a rename made elsewhere after its own receipt was superseded', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const other = resources.draft({ type: 'notes', id: [note.id] });
		await other.read();
		await other.stage({ kind: 'renameNote', noteId: note.id, title: 'Renamed elsewhere' });
		await resources.synchronize();
		await store.stage(noteCommand({ ...note, plainText: 'My later typing' }));
		await resources.synchronize();
		const stored = server.records.get(key)?.value;
		expect({
			status: store.status,
			server: stored?.type === 'notes' && [stored.value.title, stored.value.plainText]
		}).toEqual({ status: 'synced', server: ['Renamed elsewhere', 'My later typing'] });
	});
	it('reports a rename made elsewhere as newer once its own receipt is superseded', async () => {
		const { note, store, resources } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'First edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const other = resources.draft({ type: 'notes', id: [note.id] });
		await other.read();
		await other.stage({ kind: 'renameNote', noteId: note.id, title: 'Renamed elsewhere' });
		await resources.synchronize();
		expect({ status: store.status, newer: store.newer?.title }).toEqual({
			status: 'synced',
			newer: 'Renamed elsewhere'
		});
	});
	it('never automatically resurrects an edit discarded by another surface', async () => {
		const { note, store, resources, server, key } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'Discarded edit' }));
		await resources.discard(resources.pending.map((entry) => entry.intent.operationId));
		await store.stage(noteCommand({ ...note, plainText: 'Keep my buffer' }));
		resources.setOnline(true);
		await resources.synchronize();
		expect({
			status: store.status,
			local: store.value?.plainText,
			server: server.records.get(key)?.value
		}).toEqual({
			status: 'conflict',
			local: 'Keep my buffer',
			server: { type: 'notes', value: note }
		});
	});
	it('rebases onto a later server revision that changed no field the edit changed', async () => {
		const { note, key, store, server, resources, accept } = await setup();
		await store.read();
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		const changed = {
			etag: syncEtag(3n),
			value: {
				type: 'notes' as const,
				value: { ...note, plainText: 'My edit', currentRevision: 3 }
			}
		};
		server.records.set(key, changed);
		await accept(changed);
		await store.stage(noteCommand({ ...note, plainText: 'Later typing' }));
		await resources.synchronize();
		expect({ status: store.status, server: server.records.get(key)?.etag }).toEqual({
			status: 'synced',
			server: syncEtag(4n)
		});
	});
	it('can save again after explicitly keeping its conflicting write', async () => {
		const { note, key, store, server, resources } = await setup();
		await store.read();
		server.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...note, plainText: 'Other client' } }
		});
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		resources.setOnline(true);
		await resources.synchronize();
		await store.keep();
		await store.stage(noteCommand({ ...note, plainText: 'After explicit keep' }));
		await resources.synchronize();
		expect(store.status).toBe('synced');
	});
});

it('coalesces overlapping local saves using their serialized observed ancestry', async () => {
	const { note, store, resources } = await setup();
	await store.read();
	await Promise.all([
		store.stage(noteCommand({ ...note, plainText: 'First' })),
		store.stage(noteCommand({ ...note, plainText: 'Second' }))
	]);
	expect(resources.pending.map((entry) => entry.intent.local)).toEqual([
		{ type: 'notes', value: { ...note, plainText: 'Second', updatedAt: expect.any(String) } }
	]);
});

// SYNC-DECISION: discard never authorizes submission.
it('discards a queued edit without changing the authoritative note after reconnecting', async () => {
	const { note, key, store, server, resources } = await setup();
	await store.read();
	await store.stage(noteCommand({ ...note, plainText: 'Do not submit this' }));
	await resources.synchronize();
	resources.setOnline(true);
	const outcome = await store.discard().then(
		(value) => ({ kind: 'discarded', value }),
		(error) => ({ kind: 'failure', message: String(error) })
	);
	expect({
		outcome,
		authoritative: server.records.get(key)?.value,
		pending: resources.pending
	}).toEqual({
		outcome: { kind: 'discarded', value: { kind: 'ready', value: note } },
		authoritative: { type: 'notes', value: note },
		pending: []
	});
});

it('prepares overlapping commands against preceding local changes without replacing unseen metadata', async () => {
	const { note, store, views } = await setup();
	await store.read();
	await Promise.all([
		store.stage({ kind: 'renameNote', noteId: note.id, title: 'Renamed' }),
		store.stage({
			kind: 'saveNote',
			noteId: note.id,
			document: note.document,
			plainText: 'Later text'
		})
	]);
	expect(views.all('notes').map(({ title, plainText }) => ({ title, plainText }))).toEqual([
		{ title: 'Renamed', plainText: 'Later text' }
	]);
});

it('rejects a published body from another note before queuing a discard', async () => {
	const { note, store, resources } = await setup();
	await store.read();
	const result = await store.discardPublished({
		id: 'a0000000-0000-4000-8000-000000000091' as NoteRevisionId,
		noteId: testNoteId(2),
		revision: note.publishedRevision,
		title: note.title,
		document: note.document,
		plainText: note.plainText,
		createdAt: note.createdAt
	});
	expect({ result: result.kind, queued: resources.pending.length }).toEqual({
		result: 'failure',
		queued: 0
	});
});

it('creates an offline note and waits for its locally created project', async () => {
	const { resources, queued } = await setup();
	const project = projectBuilder();
	await resources.create({ kind: 'createProject', id: project.id, name: project.name });
	const created = await resources.create({
		kind: 'createNote',
		id: testNoteId(3),
		projectId: project.id,
		title: '  Captured offline  '
	});
	const entries = queued();
	expect({
		title: created.type === 'notes' ? created.value.title : null,
		dependencies: entries[1]?.intent.dependencies
	}).toEqual({ title: 'Captured offline', dependencies: [entries[0]?.intent.operationId] });
});

it('sends only the fields a document save changed, not the metadata the editor echoes', async () => {
	const { note, store, resources } = await setup();
	await store.read();
	await store.stage(noteCommand({ ...note, plainText: 'Typed' }));
	expect(resources.pending[0]?.intent.command).toEqual({
		kind: 'saveNote',
		noteId: note.id,
		document: note.document,
		plainText: 'Typed'
	});
});

describe('an open editor and versions made elsewhere', () => {
	const elsewhere = (note: ReturnType<typeof noteBuilder>, etag: bigint) => ({
		etag: syncEtag(etag),
		value: { type: 'notes' as const, value: { ...note, plainText: 'Other client' } }
	});
	const savedOnline = async () => {
		const context = await setup();
		await context.store.open();
		await context.store.stage(noteCommand({ ...context.note, plainText: 'My edit' }));
		context.resources.setOnline(true);
		await context.resources.synchronize();
		return context;
	};
	it('captures a cached base before the first render', async () => {
		const { note, store } = await setup();
		void store.open();
		expect(store.state).toEqual({ kind: 'ready', value: note });
	});
	it('does not report its own acknowledged save as newer', async () => {
		const { store } = await savedOnline();
		expect(store.newer).toBeNull();
	});
	it('reports a revision made elsewhere after its own save was acknowledged', async () => {
		const { note, key, store, server, resources } = await savedOnline();
		server.records.set(key, elsewhere(note, 3n));
		await resources.synchronize();
		expect(store.newer).toEqual({ ...note, plainText: 'Other client' });
	});
	it('does not report a newer version while its own edit is unsent', async () => {
		const { note, store, accept } = await setup();
		await store.open();
		await store.stage(noteCommand({ ...note, plainText: 'My edit' }));
		await accept(elsewhere(note, 2n));
		expect(store.newer).toBeNull();
	});
	it('observes the newer version once it adopts it', async () => {
		const { note, key, store, server, resources } = await savedOnline();
		server.records.set(key, elsewhere(note, 3n));
		await resources.synchronize();
		store.adopt();
		expect(store.newer).toBeNull();
	});
});

it('does not publish a delayed local save into a stopped account', async () => {
	const { note, store, replica, resources, workspace } = await setup();
	await store.read();
	const gate = replica.pauseTransaction();
	const saving = store.stage(noteCommand({ ...note, plainText: 'Saved during teardown' }));
	await gate.started;
	workspace.stop();
	gate.release();
	const result = await saving;
	expect({ result, value: store.value, records: [...resources.records.values()] }).toEqual({
		result: { kind: 'failure', message: 'This workspace account has stopped' },
		value: null,
		records: []
	});
});
