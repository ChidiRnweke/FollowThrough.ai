import { describe, expect, it } from 'vitest';
import { noteTrashWrite } from '$lib/testing/workspace/fixtures/commands';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();
describe('local note trash actions', () => {
	it('retains the note body when moving it to trash', async () => {
		const note = noteBuilder();
		expect(await noteTrashWrite(note, 'archive', [note], testNow)).toEqual({
			command: { kind: 'archiveNote', noteId: note.id },
			local: { type: 'notes', value: { ...note, archivedAt: testNow, updatedAt: testNow } },
			coalesce: null
		});
	});
	it('refuses to hide active children by archiving their folder', async () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: ''
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id });
		await expect(
			async () => await noteTrashWrite(folder, 'archive', [folder, child], testNow)
		).rejects.toThrow('A folder with active contents cannot be archived');
	});
	it('allows a folder whose children are already in trash', async () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: ''
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id, archivedAt: testNow });
		expect((await noteTrashWrite(folder, 'archive', [folder, child], testNow)).command).toEqual({
			kind: 'archiveNote',
			noteId: folder.id
		});
	});
	it('restores into an active parent and waits for its local creation', async () => {
		const folderId = testNoteId();
		const child = noteBuilder({
			id: testNoteId(2),
			parentId: folderId,
			archivedAt: testNow,
			position: 3
		});
		const project = projectBuilder({ id: child.projectId });
		const fixture = workspaceFixture({ accountId: child.userId });
		fixture.replica.seed(
			child.userId,
			[
				{ type: 'projects' as const, value: project },
				{ type: 'notes' as const, value: child }
			].map((value) => ({
				key: workspaceResourceKey(workspaceRecordIdentity(value)),
				entry: { kind: 'present' as const, snapshot: { etag: syncEtag(1n), value } }
			})),
			{ cursor: syncCursorSchema.parse('1'), inventoryComplete: true }
		);
		fixture.environment.fixedNow = testNow;
		const resources = await fixture.start(false);
		await resources.create({
			kind: 'createFolder',
			id: folderId,
			projectId: project.id,
			name: 'Folder'
		});
		const draft = resources.draft({ type: 'notes', id: [child.id] });
		await draft.read();
		await draft.stage({ kind: 'restoreNote', noteId: child.id });
		const [creation, restore] = resources.pending;
		fixture.workspace.stop();
		const { archivedAt, ...restored } = child;
		void archivedAt;
		expect({ local: restore?.intent.local, waitsFor: restore?.intent.dependencies }).toEqual({
			local: { type: 'notes', value: { ...restored, updatedAt: testNow } },
			waitsFor: [creation?.intent.operationId]
		});
	});
	it('restores a child of a trashed folder at the project root', async () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: '',
			archivedAt: testNow
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id, archivedAt: testNow });
		const { archivedAt, parentId, ...restored } = child;
		void archivedAt;
		void parentId;
		expect((await noteTrashWrite(child, 'restore', [folder, child], testNow)).local).toEqual({
			type: 'notes',
			value: { ...restored, position: 1 }
		});
	});
	it('refuses to restore a note that is already active', async () => {
		const note = noteBuilder();
		await expect(
			async () => await noteTrashWrite(note, 'restore', [note], testNow)
		).rejects.toThrow('The note is not archived');
	});
});
