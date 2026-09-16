import { expect, it } from 'vitest';
import { prepareWorkspaceCommand } from '$lib/controllers/workspace/commands';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('does not treat an unloaded parent as a missing parent during restore', () => {
	const note = noteBuilder({ parentId: testNoteId(2), archivedAt: testNow });
	const records = new Map<string, WorkspaceRecord>();
	expect(() =>
		prepareWorkspaceCommand(
			{ kind: 'restoreNote', noteId: note.id },
			{ type: 'notes', value: note },
			{
				userId: testActor().userId,
				now: testNow,
				records,
				inventory: 'partial'
			}
		)
	).toThrow('Required workspace data is not available');
});

it('does not treat a partially downloaded folder as empty', () => {
	const note = noteBuilder({
		kind: 'folder',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	expect(() =>
		prepareWorkspaceCommand(
			{ kind: 'archiveNote', noteId: note.id },
			{ type: 'notes', value: note },
			{
				userId: testActor().userId,
				now: testNow,
				records: new Map(),
				inventory: 'partial'
			}
		)
	).toThrow('Required workspace data is not available');
});

it('does not assign sibling order from an incomplete inventory', () => {
	const project = projectBuilder();
	const records = new Map<string, WorkspaceRecord>([
		[
			workspaceResourceKey({ type: 'projects', id: [project.id] }),
			{ type: 'projects', value: project }
		]
	]);
	expect(() =>
		prepareWorkspaceCommand(
			{ kind: 'createNote', id: testNoteId(), projectId: project.id, title: 'Draft' },
			null,
			{
				userId: testActor().userId,
				now: testNow,
				records,
				inventory: 'partial'
			}
		)
	).toThrow('Required workspace data is not available');
});

it('allows archiving a loaded ordinary note without unrelated collection data', () => {
	const note = noteBuilder();
	expect(
		prepareWorkspaceCommand(
			{ kind: 'archiveNote', noteId: note.id },
			{ type: 'notes', value: note },
			{
				userId: testActor().userId,
				now: testNow,
				records: new Map(),
				inventory: 'partial'
			}
		).local
	).toEqual({ type: 'notes', value: { ...note, archivedAt: testNow, updatedAt: testNow } });
});
