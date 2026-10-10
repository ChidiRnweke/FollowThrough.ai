import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { syncEtag } from '$lib/models/sync';
import { expect, it } from 'vitest';
import { ProjectActions } from './actions';
import { ProjectActionStore } from '$lib/stores/projects/project-actions.svelte';
import {
	InMemoryProjectActionRemote,
	InMemoryProjectActionEnvironment,
	InMemoryProjectActionWorkspace
} from '$lib/testing/projects/fakes/browser-actions';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const remote = new InMemoryProjectActionRemote();
	const environment = new InMemoryProjectActionEnvironment();
	const workspace = new InMemoryProjectActionWorkspace();
	return {
		remote,
		environment,
		workspace,
		controller: new ProjectActions(
			new ProjectActionStore(),
			workspace,
			remote,
			environment,
			new NoteSectionNumberingService()
		)
	};
};
it('returns committed deletion and refreshes the workspace before reporting completion', async () => {
	const { controller, remote, workspace } = setup();
	const output = await controller.deleteNoteForever(testNoteId());
	expect({
		deleted: output?.deletedNoteIds,
		stored: remote.removed,
		synchronized: workspace.synchronized,
		busy: controller.busy
	}).toEqual({
		deleted: [testNoteId()],
		stored: [testNoteId()],
		synchronized: [null],
		busy: false
	});
});
it('retains a domain failure for the caller without refreshing or claiming deletion', async () => {
	const { controller, remote, workspace } = setup();
	remote.failure = new Error('The note still has a dependent entry');
	const output = await controller.deleteNoteForever(testNoteId());
	expect({
		output,
		error: controller.lastError,
		stored: remote.removed,
		synchronized: workspace.synchronized,
		busy: controller.busy
	}).toEqual({
		output: undefined,
		error: 'The note still has a dependent entry',
		stored: [],
		synchronized: [],
		busy: false
	});
});
it('does not refresh a replacement account when a remote deletion settles late', async () => {
	const { controller, remote, environment, workspace } = setup();
	const gate = remote.pauseRemoval();
	const deleting = controller.deleteNoteForever(testNoteId());
	await gate.started;
	environment.accountId = 'bob';
	gate.release();
	const output = await deleting;
	expect({
		output,
		synchronized: workspace.synchronized,
		error: controller.lastError,
		busy: controller.busy
	}).toEqual({ output: undefined, synchronized: [], error: undefined, busy: false });
});
it('keeps the busy state until both concurrent actions settle', async () => {
	const { controller, remote } = setup();
	const gate = remote.pauseRemoval();
	const first = controller.deleteNoteForever(testNoteId());
	await gate.started;
	await controller.deleteNoteForever(testNoteId(2));
	const busy = controller.busy;
	gate.release();
	await first;
	expect({ during: busy, after: controller.busy }).toEqual({ during: true, after: false });
});

it('renames through a captured editor and persists the offline command before returning', async () => {
	const { controller, environment, workspace } = setup();
	const note = noteBuilder({ title: 'Original' });
	const { resources, cache } = workspaceResourcesFixture(note.userId);
	resources.setOnline(false);
	await cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	await resources.initialize();
	workspace.current = { resources };
	environment.accountId = note.userId;
	try {
		const editor = controller.editor('notes', note.id);
		const renamed = await controller.renameNote(editor, 'Renamed');
		expect({
			title: renamed?.note.title,
			queued: resources.pending.map((entry) => entry.intent.command)
		}).toEqual({
			title: 'Renamed',
			queued: [{ kind: 'renameNote', noteId: note.id, title: 'Renamed' }]
		});
	} finally {
		resources.stop();
	}
});

it('refuses an editor captured before the account session stopped', async () => {
	const { controller, environment, workspace } = setup();
	const note = noteBuilder();
	const { resources, cache } = workspaceResourcesFixture(note.userId);
	resources.setOnline(false);
	await cache.accept(workspaceResourceKey({ type: 'notes', id: [note.id] }), {
		etag: syncEtag(1n),
		value: { type: 'notes', value: note }
	});
	await resources.initialize();
	workspace.current = { resources };
	environment.accountId = note.userId;
	const editor = controller.editor('notes', note.id);
	workspace.current = null;
	try {
		const renamed = await controller.renameNote(editor, 'Late rename');
		expect({ renamed, queued: resources.pending, error: controller.lastError }).toEqual({
			renamed: undefined,
			queued: [],
			error: 'The workspace account changed during the project action.'
		});
	} finally {
		resources.stop();
	}
});
