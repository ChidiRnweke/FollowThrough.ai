import { afterEach, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
const cleanups: (() => void)[] = [];
const setup = async () => {
	const f = await noteWorkspaceFixture();
	cleanups.push(() => f.close());
	f.edit('Local');
	await f.controller.save();
	const remote = {
		...f.note,
		title: 'Remote',
		plainText: 'Remote',
		document: {
			type: 'doc' as const,
			content: [
				{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Remote' }] }
			]
		},
		currentRevision: 2
	};
	f.transport.records.set(f.key, { etag: syncEtag(2n), value: { type: 'notes', value: remote } });
	f.resources.setOnline(true);
	await f.controller.retrySync();
	return { ...f, remote };
};
afterEach(() => {
	cleanups.splice(0).forEach((close) => close());
});

it('keeps the local document through conflict resolution', async () => {
	const f = await setup();
	await f.controller.keepLocalVersion();
	expect({
		status: f.controller.sync.status,
		editor: f.editor.plainText,
		saved: f.transport.records.get(f.key)?.value
	}).toEqual({
		status: 'synced',
		editor: 'Local',
		saved: {
			type: 'notes',
			value: expect.objectContaining({ plainText: 'Local', title: 'Original' })
		}
	});
});
it('replaces the editor only after choosing the remote conflict version', async () => {
	const f = await setup();
	await f.controller.useRemoteVersion();
	expect({
		title: f.controller.note.title,
		dirty: f.controller.dirty,
		document: f.editor.document,
		pending: f.resources.pending
	}).toEqual({ title: 'Remote', dirty: false, document: f.remote.document, pending: [] });
});
it('keeps unsaved later typing when keeping the queued local version', async () => {
	const f = await setup();
	f.edit('Later typing');
	await f.controller.keepLocalVersion();
	expect({ dirty: f.controller.dirty, text: f.editor.plainText }).toEqual({
		dirty: true,
		text: 'Later typing'
	});
});
it('does not publish through an unresolved conflict', async () => {
	const f = await setup();
	await f.controller.publish();
	expect(f.resources.pending.map((entry) => entry.intent.command.kind)).toEqual(['saveNote']);
});
it('retains typing that arrives during use-remote resolution', async () => {
	const f = await setup();
	const pause = f.repository.pauseNextLoad();
	const resolving = f.controller.useRemoteVersion();
	await pause.started;
	f.edit('Later typing');
	pause.release();
	await resolving;
	expect({ dirty: f.controller.dirty, text: f.editor.plainText }).toEqual({
		dirty: true,
		text: 'Later typing'
	});
});
