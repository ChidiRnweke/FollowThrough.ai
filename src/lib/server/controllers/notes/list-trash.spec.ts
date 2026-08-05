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
			noteArchiver: service,
			noteTrashReader: service,
			noteIndexer: indexer,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller, indexer };
};

describe('Note trash listing invariants', () => {
	it('lists only the trashed notes', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder(), noteBuilder({ id: testNoteId(2), archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes.map((note) => note.id)).toEqual([testNoteId(2)]);
	});

	it('names each note’s project so the global trash can group them', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes[0]?.projectName).toBe('Project Alpha');
	});

	// Twenty trashed notes should not mean twenty documents on the wire; a trash row
	// shows a title and a date and nothing else.
	it('omits the document body from trash rows', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow, plainText: 'Secret body' })];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes[0]).not.toHaveProperty('plainText');
	});

	it('keeps skills out of the note trash', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ kind: 'skill', archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), {});
		expect(result.notes).toEqual([]);
	});

	it('scopes the listing to one project when asked', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.listTrash(testActor(), { projectId: testProjectId(2) });
		expect(result.notes).toEqual([]);
	});
});
