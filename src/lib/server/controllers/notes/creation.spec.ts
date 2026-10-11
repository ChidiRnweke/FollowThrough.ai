import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { describe, expect, it } from 'vitest';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
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
	const records = new InMemoryNoteRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor(), records);
	projects.projects = [projectBuilder()];
	return {
		records,
		creation: noteCreationControllers(
			createNoteServices(
				testActor(),
				records,
				new InMemoryAnchorRepository(testActor()),
				projects,
				testClock
			).creator,
			new InMemoryTransactionRunner([records, projects])
		)
	};
};
describe('Note creation', () => {
	it('preserves the final identity assigned to a note before it was synchronized', async () => {
		const { creation } = setup();
		const id = testNoteId(501);
		const { note } = await creation.notes.create({
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
		const { note } = await creation.notes.create(command);
		expect(note.kind).toBe('note');
	});
});
