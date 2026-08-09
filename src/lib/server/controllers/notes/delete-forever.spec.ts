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
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = new NoteCatalog(notes, new InMemoryAnchorRepository(), projects);
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			notePurger: service,
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() }
		})
	);
	return { notes, controller };
};

describe('Permanent note deletion invariants', () => {
	it('removes the trashed note from the store', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(notes.notes).toEqual([]);
	});

	it('reports the note it destroyed', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const result = await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(result.deletedNoteIds).toEqual([testNoteId()]);
	});

	// Deleting the folder alone would leave its contents parented to nothing, which the
	// `set null` foreign key would silently turn into notes sitting at the project root.
	it('takes the trashed notes inside a folder with it', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder', archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
		];
		await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(notes.notes).toEqual([]);
	});

	it('follows nesting further than one level down', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder', archivedAt: testNow }),
			noteBuilder({
				id: testNoteId(2),
				kind: 'folder',
				parentId: testNoteId(),
				archivedAt: testNow
			}),
			noteBuilder({ id: testNoteId(3), parentId: testNoteId(2), archivedAt: testNow })
		];
		const result = await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(result.deletedNoteIds).toHaveLength(3);
	});

	it('deletes the contents before the folder that holds them', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder', archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
		];
		const result = await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(result.deletedNoteIds).toEqual([testNoteId(2), testNoteId()]);
	});

	it('leaves an active note inside a trashed folder alone', async () => {
		const { notes, controller } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder', archivedAt: testNow }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId() })
		];
		await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(notes.notes.map((note) => note.id)).toEqual([testNoteId(2)]);
	});

	it('rejects deleting a note that is not in the trash', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder()];
		await expect(
			controller.deleteForever(testActor(), { noteId: testNoteId() })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects deleting a skill, which the trash never showed', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ kind: 'skill', archivedAt: testNow })];
		await expect(
			controller.deleteForever(testActor(), { noteId: testNoteId() })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('does not destroy another user’s trashed note', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await expect(
			controller.deleteForever(testActor(2), { noteId: testNoteId() })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('drops the revisions the note carried', async () => {
		const { notes, controller } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await notes.insertRevision(testActor(), {
			id: testNoteId(9) as never,
			noteId: testNoteId(),
			revision: 1,
			title: 'Architecture note',
			document: { type: 'doc', content: [] },
			plainText: '',
			createdAt: testNow
		});
		await controller.deleteForever(testActor(), { noteId: testNoteId() });
		expect(notes.revisions).toEqual([]);
	});
});
