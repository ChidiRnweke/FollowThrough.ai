import { expect, it } from 'vitest';
import { prepareWorkspaceCommand } from '$lib/testing/workspace/fixtures/commands';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
it('does not treat an unloaded parent as a missing parent during restore', async () => {
	const note = noteBuilder({ parentId: testNoteId(2), archivedAt: testNow });
	const records = new Map<string, WorkspaceRecord>();
	await expect(
		async () =>
			await prepareWorkspaceCommand(
				{ kind: 'restoreNote', noteId: note.id },
				{ type: 'notes', value: note },
				{
					userId: testActor().userId,
					now: testNow,
					records,
					inventory: 'partial'
				}
			)
	).rejects.toThrow('Required workspace data is not available');
});
it('does not treat a partially downloaded folder as empty', async () => {
	const note = noteBuilder({
		kind: 'folder',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	await expect(
		async () =>
			await prepareWorkspaceCommand(
				{ kind: 'archiveNote', noteId: note.id },
				{ type: 'notes', value: note },
				{
					userId: testActor().userId,
					now: testNow,
					records: new Map(),
					inventory: 'partial'
				}
			)
	).rejects.toThrow('Required workspace data is not available');
});
it('does not assign sibling order from an incomplete inventory', async () => {
	const project = projectBuilder();
	const records = new Map<string, WorkspaceRecord>([
		[
			workspaceResourceKey({ type: 'projects', id: [project.id] }),
			{ type: 'projects', value: project }
		]
	]);
	await expect(
		async () =>
			await prepareWorkspaceCommand(
				{ kind: 'createNote', id: testNoteId(), projectId: project.id, title: 'Draft' },
				null,
				{
					userId: testActor().userId,
					now: testNow,
					records,
					inventory: 'partial'
				}
			)
	).rejects.toThrow('Required workspace data is not available');
});
it('allows archiving a loaded ordinary note without unrelated collection data', async () => {
	const note = noteBuilder();
	expect(
		(
			await prepareWorkspaceCommand(
				{ kind: 'archiveNote', noteId: note.id },
				{ type: 'notes', value: note },
				{
					userId: testActor().userId,
					now: testNow,
					records: new Map(),
					inventory: 'partial'
				}
			)
		).local
	).toEqual({ type: 'notes', value: { ...note, archivedAt: testNow, updatedAt: testNow } });
});
