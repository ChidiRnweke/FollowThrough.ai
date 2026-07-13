import { describe, expect, it } from 'vitest';
import { DefaultNotesController, type NotesDependencies } from './controller';
import { NoteManagementService } from '$lib/services/notes/management';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = new NoteManagementService(notes, new InMemoryAnchorRepository(), projects);
	const controller = new DefaultNotesController({
		noteArchiver: service
	} as unknown as NotesDependencies);
	return { notes, controller };
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
