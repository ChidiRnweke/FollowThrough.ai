import { describe, expect, it } from 'vitest';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	projectBuilder,
	testActor,
	testNoteId
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
describe('Note creation', () => {
	it('preserves the final identity assigned to a note before it was synchronized', async () => {
		const { creation } = setup();
		const id = testNoteId(501);
		const { note } = await creation.notes.create(testActor(), {
			id,
			projectId: projectBuilder().id,
			title: 'Offline note'
		});
		expect(note.id).toBe(id);
	});

	it('keeps the command discriminator separate from the created document kind', async () => {
		const { creation } = setup();
		const command = {
			kind: 'createNote',
			id: testNoteId(502),
			projectId: projectBuilder().id,
			title: 'Offline note'
		};
		const { note } = await creation.notes.create(testActor(), command);
		expect(note.kind).toBe('note');
	});
});
