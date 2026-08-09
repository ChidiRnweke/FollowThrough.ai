import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
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
	projects.projects = [projectBuilder(), projectBuilder({ id: testProjectId(2), name: 'Beta' })];
	const service = new NoteCatalog(notes, new InMemoryAnchorRepository(), projects);
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			notePurger: service,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller };
};

describe('Empty trash invariants', () => {
	it('destroys every trashed note', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), archivedAt: testNow })
		];
		await controller.emptyTrash(testActor(), {});
		expect(notes.notes).toEqual([]);
	});

	it('leaves the active notes untouched', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder(), noteBuilder({ id: testNoteId(2), archivedAt: testNow })];
		await controller.emptyTrash(testActor(), {});
		expect(notes.notes.map((note) => note.id)).toEqual([testNoteId()]);
	});

	it('reports the ids it destroyed', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.emptyTrash(testActor(), {});
		expect(result.deletedNoteIds).toEqual([testNoteId()]);
	});

	it('empties only the named project', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), projectId: testProjectId(2), archivedAt: testNow })
		];
		await controller.emptyTrash(testActor(), { projectId: testProjectId(2) });
		expect(notes.notes.map((note) => note.id)).toEqual([testNoteId()]);
	});

	// Skills are filtered out of the trash listing, so emptying the trash must not destroy
	// what the user was never shown.
	it('spares trashed skills', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ kind: 'skill', archivedAt: testNow })];
		await controller.emptyTrash(testActor(), {});
		expect(notes.notes).toHaveLength(1);
	});

	it('leaves another user’s trash alone', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await controller.emptyTrash(testActor(2), {});
		expect(notes.notes).toHaveLength(1);
	});

	it('does nothing when the trash is already empty', async () => {
		const { controller } = setup();
		const result = await controller.emptyTrash(testActor(), {});
		expect(result.deletedNoteIds).toEqual([]);
	});
});
