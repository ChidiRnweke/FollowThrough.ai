import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = new NoteCatalog(notes, new InMemoryAnchorRepository(), projects);
	const indexer = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteTrash: service,
			noteTrashReader: service,
			noteIndexer: indexer,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller, indexer };
};

describe('Note trash listing invariants', () => {
	it('lists archived notes with project labels while omitting bodies and skills', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder(),
			noteBuilder({ id: testNoteId(2), archivedAt: testNow, plainText: 'Secret body' }),
			noteBuilder({ id: testNoteId(3), kind: 'skill', archivedAt: testNow })
		];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes).toEqual([
			expect.objectContaining({ id: testNoteId(2), projectName: 'Project Alpha' })
		]);
		expect(result.notes[0]).not.toHaveProperty('plainText');
	});

	it('scopes the listing to one project when asked', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), { projectId: testProjectId(2) });
		expect(result.notes).toEqual([]);
	});
});
