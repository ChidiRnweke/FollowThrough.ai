import { expect, it } from 'vitest';
import { prepareWorkspaceCommand } from './commands';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import {
	testActor,
	testNow,
	testProjectId,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('opens a locally created project with its stable identity before acknowledgment', () => {
	const records = new Map<string, WorkspaceRecord>();
	const result = prepareWorkspaceCommand(
		{ kind: 'createProject', id: testProjectId(), name: '  Research  ' },
		null,
		{ userId: testActor().userId, now: testNow, records, inventory: 'complete' }
	);
	if (!result.local) throw new Error('Creation must return a project');
	records.set(workspaceResourceKey({ type: 'projects', id: [testProjectId()] }), result.local);
	expect(createWorkspaceViews(records).project(testProjectId())).toMatchObject({
		project: { id: testProjectId(), name: 'Research', role: 'workspace' },
		tree: []
	});
});
it('opens nested folders created against a local project before server acknowledgment', () => {
	const records = new Map<string, WorkspaceRecord>();
	const context = {
		userId: testActor().userId,
		now: testNow,
		records,
		inventory: 'complete' as const
	};
	const project = prepareWorkspaceCommand(
		{ kind: 'createProject', id: testProjectId(), name: 'Research' },
		null,
		context
	);
	if (!project.local) throw new Error('Creation must return a project');
	records.set(workspaceResourceKey({ type: 'projects', id: [testProjectId()] }), project.local);
	for (const [id, parentId, name] of [
		[testNoteId(), undefined, 'Parent'],
		[testNoteId(2), testNoteId(), '  Decisions  ']
	] as const) {
		const folder = prepareWorkspaceCommand(
			{ kind: 'createFolder', id, projectId: testProjectId(), parentId, name },
			null,
			context
		);
		if (!folder.local) throw new Error('Creation must return a folder');
		records.set(workspaceResourceKey({ type: 'notes', id: [id] }), folder.local);
	}
	expect(
		createWorkspaceViews(records).project(testProjectId())?.tree[0]?.children[0]?.entry
	).toMatchObject({
		id: testNoteId(2),
		parentId: testNoteId(),
		title: 'Decisions',
		kind: 'folder',
		plainText: ''
	});
});
