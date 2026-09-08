import { expect, it } from 'vitest';
import { projectBuilder, noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { WriteDraft } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { assertWorkspaceWriteIdentity, type WorkspaceCommand } from './index';

const project = projectBuilder();
const different = projectBuilder({
	id: 'a0000000-0000-4000-8000-000000000009' as typeof project.id
});
const input: WriteDraft<WorkspaceCommand, WorkspaceRecord> = {
	operationId: 'a0000000-0000-4000-8000-000000000008',
	key: workspaceResourceKey({ type: 'projects', id: [project.id] }),
	command: { kind: 'renameProject', projectId: project.id, name: 'Renamed' },
	base: { etag: syncEtag(1n), value: { type: 'projects', value: project } },
	basedOn: null,
	local: { type: 'projects', value: { ...project, name: 'Renamed' } },
	coalesce: null,
	references: []
};
it('rejects a local representation belonging to another object of the same type', () => {
	expect(() =>
		assertWorkspaceWriteIdentity({ ...input, local: { type: 'projects', value: different } })
	).toThrow('edit body belongs to a different resource');
});
it('rejects a base belonging to another object', () => {
	expect(() =>
		assertWorkspaceWriteIdentity({
			...input,
			base: { etag: syncEtag(1n), value: { type: 'projects', value: different } }
		})
	).toThrow('edit body belongs to a different resource');
});
it('rejects a command aimed at a different object', () => {
	expect(() =>
		assertWorkspaceWriteIdentity({
			...input,
			command: { kind: 'renameProject', projectId: different.id, name: 'Renamed' }
		})
	).toThrow('command belongs to a different resource');
});
it('allows a correctly identified local deletion', () => {
	const note = noteBuilder();
	expect(() =>
		assertWorkspaceWriteIdentity({
			...input,
			key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
			command: { kind: 'deleteNote', noteId: note.id },
			base: { etag: syncEtag(1n), value: { type: 'notes', value: note } },
			local: null
		})
	).not.toThrow();
});
