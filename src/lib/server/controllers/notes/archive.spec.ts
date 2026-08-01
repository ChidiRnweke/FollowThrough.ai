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
	testNoteId
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
			noteIndexer: indexer,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller, indexer };
};

describe('Note archive invariants', () => {
	it('archives the note through the controller', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder()];
		const result = await controller.archive(testActor(), { noteId: testNoteId() });
		expect(result.note.archivedAt).toBeDefined();
	});

	it('removes the archived note from the active list', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder()];
		await controller.archive(testActor(), { noteId: testNoteId() });
		expect(await notes.listActive(testActor())).toEqual([]);
	});

	it('reindexes the archived note so retrieval removes its chunks', async () => {
		const { notes, controller, indexer } = setup();
		notes.notes = [noteBuilder()];
		await controller.archive(testActor(), { noteId: testNoteId() });
		expect(indexer.indexedNoteIds).toEqual([testNoteId()]);
	});

	it('rejects archiving a folder with active contents', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId() })
		];
		await expect(controller.archive(testActor(), { noteId: testNoteId() })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});
