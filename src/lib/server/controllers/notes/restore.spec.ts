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
	testNow
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

describe('Note restore invariants', () => {
	it('clears the archived marker', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.restore(testActor(), { noteId: testNoteId() });
		expect(result.note.archivedAt).toBeUndefined();
	});

	it('returns the note to the active list', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await controller.restore(testActor(), { noteId: testNoteId() });
		expect(await notes.listActive(testActor())).toHaveLength(1);
	});

	it('reindexes the note so search can find it again', async () => {
		const { notes, controller, indexer } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await controller.restore(testActor(), { noteId: testNoteId() });
		expect(indexer.indexedNoteIds).toEqual([testNoteId()]);
	});

	it('rejects restoring a note that was never trashed', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder()];
		await expect(controller.restore(testActor(), { noteId: testNoteId() })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	// A note trashed inside a folder that was trashed after it would otherwise come back
	// parented to something invisible, so it would restore into nowhere.
	it('reattaches a note whose parent folder is still in the trash to the project root', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder', archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
		];
		const result = await controller.restore(testActor(), { noteId: testNoteId(2) });
		expect(result.note.parentId).toBeUndefined();
	});

	it('keeps a note under its parent when the folder is still active', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
		];
		const result = await controller.restore(testActor(), { noteId: testNoteId(2) });
		expect(result.note.parentId).toBe(testNoteId());
	});

	it('does not expose another user’s trashed note', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await expect(controller.restore(testActor(2), { noteId: testNoteId() })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
