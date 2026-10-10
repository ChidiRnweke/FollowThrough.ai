import { expect, it } from 'vitest';
import { NoteDraftEditing } from './draft-editing';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async () => {
	const note = noteBuilder({ title: 'Original', isPinned: false, sectionNumbering: true });
	const { resources, cache } = workspaceResourcesFixture(note.userId);
	resources.setOnline(false);
	await cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	await resources.initialize();
	const draft = resources.draft({ type: 'notes', id: [note.id] });
	draft.capture();
	return {
		note,
		resources,
		controller: new NoteDraftEditing(note.id, draft, new NoteSectionNumberingService())
	};
};
it('persists authored fields offline before reporting a saved note', async () => {
	const { note, resources, controller } = await setup();
	try {
		const result = await controller.save({ ...note, title: 'Edited' });
		expect({
			title: result.kind === 'saved' ? result.value.title : result,
			commands: resources.pending.map((entry) => entry.intent.command)
		}).toEqual({
			title: 'Edited',
			commands: [
				{
					kind: 'saveNote',
					noteId: note.id,
					title: 'Edited',
					document: note.document,
					plainText: note.plainText,
					isPinned: false
				}
			]
		});
	} finally {
		resources.stop();
	}
});
it('pins the current authored content in the same durable write', async () => {
	const { note, resources, controller } = await setup();
	try {
		const result = await controller.togglePin({ ...note, title: 'Unsaved title' });
		expect({
			saved:
				result.kind === 'saved'
					? { title: result.value.title, pinned: result.value.isPinned }
					: result,
			commands: resources.pending.map((entry) => entry.intent.command)
		}).toEqual({
			saved: { title: 'Unsaved title', pinned: true },
			commands: [
				{
					kind: 'saveNote',
					noteId: note.id,
					title: 'Unsaved title',
					document: note.document,
					plainText: note.plainText,
					isPinned: true
				}
			]
		});
	} finally {
		resources.stop();
	}
});
it('removes the numbering override when the editor selects the inherited default', async () => {
	const { note, resources, controller } = await setup();
	try {
		const result = await controller.numbering('default');
		expect({
			override: result.kind === 'saved' ? result.value.sectionNumbering : result,
			commands: resources.pending.map((entry) => entry.intent.command)
		}).toEqual({
			override: undefined,
			commands: [{ kind: 'noteNumbering', noteId: note.id, enabled: undefined }]
		});
	} finally {
		resources.stop();
	}
});
it('rejects a save after the account closes without adding an operation', async () => {
	const { note, resources, controller } = await setup();
	resources.stop();
	const result = await controller.save({ ...note, title: 'Late edit' });
	expect({ result, pending: resources.pending }).toEqual({
		result: { kind: 'failure', message: 'The note editor is no longer active' },
		pending: []
	});
});
