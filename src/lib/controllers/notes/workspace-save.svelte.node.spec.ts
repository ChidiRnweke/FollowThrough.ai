import { afterEach, expect, it } from 'vitest';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
const cleanups: (() => void)[] = [];
const setup = async () => {
	const fixture = await noteWorkspaceFixture();
	cleanups.push(() => fixture.close());
	return fixture;
};
afterEach(() => {
	cleanups.splice(0).forEach((close) => close());
});

it('autosaves the latest editor content after two seconds without replacing its document', async () => {
	const f = await setup();
	f.edit('First');
	await f.scheduler.advance(1500);
	f.edit('Latest');
	await f.scheduler.advance(2000);
	expect({
		dirty: f.controller.dirty,
		text: f.controller.note.plainText,
		document: f.editor.document
	}).toEqual({ dirty: false, text: 'Latest', document: f.controller.note.document });
});
it('does not save before the replacement autosave deadline', async () => {
	const f = await setup();
	f.edit('First');
	await f.scheduler.advance(1500);
	f.edit('Latest');
	await f.scheduler.advance(500);
	expect(f.resources.pending).toEqual([]);
});
it('cancels autosave on pane release', async () => {
	const f = await setup();
	f.edit('Unsaved');
	f.controller.close();
	await f.scheduler.advance(2000);
	expect(f.resources.pending).toEqual([]);
});
it('keeps blank-title autosave silent and dirty', async () => {
	const f = await setup();
	f.controller.titleChanged(' ');
	await f.scheduler.advance(2000);
	expect({
		dirty: f.controller.dirty,
		feedback: f.feedback.messages,
		pending: f.resources.pending
	}).toEqual({ dirty: true, feedback: [], pending: [] });
});
it('reports the blank title on manual save', async () => {
	const f = await setup();
	f.controller.titleChanged(' ');
	await f.controller.save();
	expect(f.feedback.messages).toEqual([{ kind: 'error', message: 'Give the note a title first.' }]);
});
it('retains a failed local save for retry', async () => {
	const f = await setup();
	f.outbox.appendFailure = 'Device full';
	f.edit('Keep me');
	await f.controller.save();
	expect({
		dirty: f.controller.dirty,
		failed: f.controller.saveFailed,
		text: f.editor.plainText
	}).toEqual({ dirty: true, failed: true, text: 'Keep me' });
});
it('drains later typing while an earlier save is in flight', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	f.edit('First');
	const saving = f.controller.save();
	await pause.started;
	f.edit('Later');
	pause.release();
	await saving;
	expect({
		dirty: f.controller.dirty,
		text: f.controller.note.plainText,
		local: f.resources.pending.at(-1)?.intent.local
	}).toEqual({ dirty: false, text: 'Later', local: { type: 'notes', value: f.controller.note } });
});
it('manual save retries a clean queued edit after reconnecting', async () => {
	const f = await setup();
	f.edit('Queued');
	await f.controller.save();
	f.resources.setOnline(true);
	await f.controller.save();
	expect({
		status: f.controller.sync.status,
		saved: f.transport.records.get(f.key)?.value
	}).toEqual({
		status: 'synced',
		saved: { type: 'notes', value: expect.objectContaining({ plainText: 'Queued' }) }
	});
});
it('does not apply a save completion after the pane closes', async () => {
	const f = await setup();
	const pause = f.outbox.pauseAppend();
	f.edit('Late');
	const saving = f.controller.save();
	await pause.started;
	f.controller.close();
	pause.release();
	await saving;
	expect(f.controller.note.plainText).toBe('Original');
});
it('does not stage autosave after the account stops', async () => {
	const f = await setup();
	f.edit('Late');
	f.resources.stop();
	await f.scheduler.advance(2000);
	expect(f.resources.pending).toEqual([]);
});
