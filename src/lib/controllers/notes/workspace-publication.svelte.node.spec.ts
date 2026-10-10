import { afterEach, expect, it } from 'vitest';
import type { Note } from '$lib/models/notes';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
const cleanups: (() => void)[] = [];
const setup = async (overrides: Partial<Note> = {}) => {
	const fixture = await noteWorkspaceFixture(overrides);
	cleanups.push(() => fixture.close());
	return fixture;
};
afterEach(() => {
	cleanups.splice(0).forEach((close) => close());
});

it('queues publication after saving an offline edit', async () => {
	const f = await setup();
	f.edit('Offline');
	await f.controller.publish();
	expect(f.resources.pending.map((entry) => entry.intent.command.kind)).toEqual([
		'saveNote',
		'publishNote'
	]);
});
it('keeps one publication when a second request arrives during save', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	f.edit('Publish once');
	const first = f.controller.publish();
	await pause.started;
	const second = f.controller.publish();
	pause.release();
	await Promise.all([first, second]);
	expect(
		f.resources.pending.filter((entry) => entry.intent.command.kind === 'publishNote')
	).toHaveLength(1);
});
it('does not overwrite a newer buffer when publication completes', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	const publishing = f.controller.publish();
	await pause.started;
	f.controller.titleChanged('Later title');
	pause.release();
	await publishing;
	expect({
		title: f.controller.note.title,
		dirty: f.controller.dirty,
		published: f.controller.note.publishedRevision
	}).toEqual({ title: 'Later title', dirty: true, published: f.note.publishedRevision });
});
it('does not apply publication metadata after release', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	const publishing = f.controller.publish();
	await pause.started;
	f.controller.close();
	pause.release();
	await publishing;
	expect(f.feedback.messages).toEqual([]);
});
it('does not publish a draft whose local save failed', async () => {
	const f = await setup();
	f.outbox.appendFailure = 'Device full';
	f.edit('Retain');
	await f.controller.publish();
	expect({
		pending: f.resources.pending,
		dirty: f.controller.dirty,
		publishing: f.controller.publishing
	}).toEqual({ pending: [], dirty: true, publishing: false });
});
it('invalidates old checkpoints when adopting an external document', async () => {
	const f = await setup();
	const current = f.session.checkpoint();
	await f.acceptRemote({ ...f.note, title: 'External', currentRevision: 2 });
	f.controller.adoptNewer();
	expect({ current: current(), title: f.controller.note.title }).toEqual({
		current: false,
		title: 'External'
	});
});
it('retains a dirty buffer when an external document arrives', async () => {
	const f = await setup();
	f.edit('Local');
	await f.acceptRemote({ ...f.note, title: 'External', currentRevision: 2 });
	f.controller.adoptNewer();
	expect({
		title: f.controller.note.title,
		text: f.editor.plainText,
		dirty: f.controller.dirty
	}).toEqual({ title: 'Original', text: 'Local', dirty: true });
});
it('exposes saved changes after publication without replacing the editor document', async () => {
	const f = await setup({ currentRevision: 1, publishedRevision: 1 });
	f.edit('New draft');
	await f.controller.save();
	const document = f.editor.document;
	f.resources.setOnline(true);
	await f.resources.synchronize();
	const saved = f.transport.records.get(f.key)?.value;
	if (!saved || saved.type !== 'notes') throw new Error('Missing saved note');
	f.controller.reconcileSaved(saved.value);
	expect({
		unpublished: f.controller.hasUnpublishedChanges,
		published: f.controller.note.publishedRevision,
		sameDocument: f.editor.document === document
	}).toEqual({ unpublished: true, published: 1, sameDocument: true });
});
