import { afterEach, expect, it } from 'vitest';
import type { NoteRevision } from '$lib/models/notes';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
const cleanups: (() => void)[] = [];
const setup = async () => {
	const f = await noteWorkspaceFixture({ currentRevision: 2, publishedRevision: 1 });
	cleanups.push(() => f.close());
	const revision: NoteRevision = {
		id: '70000000-0000-4000-8000-000000000001' as NoteRevision['id'],
		noteId: f.note.id,
		revision: 1,
		title: 'Published',
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published body' }] }]
		},
		plainText: 'Published body',
		createdAt: f.note.createdAt
	};
	f.revisions.values.set(revision.id, revision);
	return { ...f, revision };
};
afterEach(() => {
	cleanups.splice(0).forEach((close) => close());
});

it('reopens a restored revision without leaving the editor dirty', async () => {
	const f = await setup();
	const restored = await f.controller.restoreRevision(f.revision.id);
	expect({
		restored,
		title: f.controller.note.title,
		dirty: f.controller.dirty,
		document: f.editor.document
	}).toEqual({ restored: true, title: 'Published', dirty: false, document: f.revision.document });
});
it('retains typing made while a historical restore is in flight', async () => {
	const f = await setup();
	const pause = f.revisions.pauseRestore();
	const restoring = f.controller.restoreRevision(f.revision.id);
	await pause.started;
	f.edit('Later typing');
	pause.release();
	await restoring;
	expect({
		dirty: f.controller.dirty,
		text: f.editor.plainText,
		title: f.controller.note.title
	}).toEqual({ dirty: true, text: 'Later typing', title: 'Original' });
});
it('does not replace a released editor when a restore completes', async () => {
	const f = await setup();
	const pause = f.revisions.pauseRestore();
	const restoring = f.controller.restoreRevision(f.revision.id);
	await pause.started;
	f.controller.close();
	pause.release();
	await restoring;
	expect({ document: f.editor.document, messages: f.feedback.messages }).toEqual({
		document: f.note.document,
		messages: []
	});
});
it('reports a missing historical revision without changing the editor', async () => {
	const f = await setup();
	f.revisions.values.clear();
	const result = await f.controller.restoreRevision(f.revision.id);
	expect({ result, note: f.controller.note }).toEqual({ result: false, note: f.note });
});
it('discards using the exact published body', async () => {
	const f = await setup();
	await f.controller.discardDraft();
	expect({
		document: f.editor.document,
		title: f.controller.note.title,
		dirty: f.controller.dirty
	}).toEqual({ document: f.revision.document, title: f.revision.title, dirty: false });
});
it('retains the draft when its published snapshot cannot be found', async () => {
	const f = await setup();
	f.revisions.values.clear();
	const result = await f.controller.discardDraft();
	expect({ result, note: f.controller.note, pending: f.resources.pending }).toEqual({
		result: { kind: 'failure' },
		note: f.note,
		pending: []
	});
});
it('retains typing made while the published discard is staged', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	const discarding = f.controller.discardDraft();
	await pause.started;
	f.edit('Later');
	pause.release();
	await discarding;
	expect({ text: f.editor.plainText, dirty: f.controller.dirty }).toEqual({
		text: 'Later',
		dirty: true
	});
});
it('blocks restoring while an authored edit is still queued', async () => {
	const f = await setup();
	f.edit('Offline');
	await f.controller.save();
	const restored = await f.controller.restoreRevision(f.revision.id);
	expect({ restored, text: f.editor.plainText }).toEqual({ restored: false, text: 'Offline' });
});
