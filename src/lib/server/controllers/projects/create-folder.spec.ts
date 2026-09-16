import { describe, expect, it } from 'vitest';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const records = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(records);
	projects.projects = [projectBuilder()];
	return {
		records,
		creation: noteCreationControllers(
			new NoteCatalog(records, new InMemoryAnchorRepository(), projects)
		)
	};
};
describe('Folder creation', () => {
	it('rejects a note as a folder parent', async () => {
		const { records, creation } = setup();
		records.notes = [noteBuilder({ id: testNoteId(2), kind: 'note' })];
		await expect(
			creation.projects.createFolder(testActor(), {
				projectId: projectBuilder().id,
				parentId: testNoteId(2),
				name: 'Nested'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('appends a folder after stored siblings including archived entries', async () => {
		const { records, creation } = setup();
		records.notes = [noteBuilder({ archivedAt: testNow })];
		const { folder } = await creation.projects.createFolder(testActor(), {
			projectId: projectBuilder().id,
			name: 'New folder'
		});
		expect(folder.position).toBe(1);
	});

	it('creates an empty folder under another folder', async () => {
		const { records, creation } = setup();
		records.notes = [noteBuilder({ kind: 'folder' })];
		const { folder } = await creation.projects.createFolder(testActor(), {
			projectId: projectBuilder().id,
			parentId: testNoteId(),
			name: 'Decisions'
		});
		expect({ kind: folder.kind, parent: folder.parentId, text: folder.plainText }).toEqual({
			kind: 'folder',
			parent: testNoteId(),
			text: ''
		});
	});
});
