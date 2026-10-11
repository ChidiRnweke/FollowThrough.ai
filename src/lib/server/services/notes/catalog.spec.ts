import { describe, expect, it } from 'vitest';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { NOTE_REVISION_HISTORY_LIMIT } from '$lib/models/notes';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	anchorBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository(testActor());
	const anchors = new InMemoryAnchorRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor());
	projects.projects = [projectBuilder()];
	const service = createNoteServices(testActor(), notes, anchors, projects);
	return { service, notes, anchors };
};

describe('Note management invariants', () => {
	it('does not expose skill documents in note listings', async () => {
		const { service, notes } = setup();
		notes.notes = [
			noteBuilder(),
			noteBuilder({ id: testNoteId(2), kind: 'folder' }),
			noteBuilder({ id: testNoteId(3), kind: 'skill' })
		];
		const listed = await service.library.list();
		expect(listed.map((note) => note.id)).toEqual([testNoteId(), testNoteId(2)]);
	});

	// Publishing is the only thing that writes history, so the cap is enforced there.
	it('retains the newest snapshots and evicts older history first', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		for (let revision = 1; revision <= NOTE_REVISION_HISTORY_LIMIT + 3; revision += 1)
			await service.authoring.record(noteBuilder({ currentRevision: revision }));
		const kept = await notes.listRevisions(testNoteId());
		expect(kept.map((entry) => entry.revision).sort((left, right) => left - right)).toEqual(
			Array.from({ length: NOTE_REVISION_HISTORY_LIMIT }, (_, index) => index + 4)
		);
	});

	it('lists a trashed note in the trash', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		expect(await service.trashReader.listTrashed()).toHaveLength(1);
	});

	it('keeps active notes out of the trash', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		expect(await service.trashReader.listTrashed()).toEqual([]);
	});

	it('leaves an ambiguous anchor unchanged during repair', async () => {
		const { service, notes, anchors } = setup();
		const note = noteBuilder({ plainText: 'same and same', currentRevision: 2 });
		notes.notes = [note];
		anchors.anchors = [anchorBuilder({ quote: 'same', from: 0, to: 4 })];
		await service.authoring.repairForNote(note);
		expect(anchors.anchors[0]?.revision).toBe(1);
	});

	it('repairs an unambiguous anchor to the new revision', async () => {
		const { service, notes, anchors } = setup();
		const note = noteBuilder({ plainText: 'prefix unique suffix', currentRevision: 2 });
		notes.notes = [note];
		anchors.anchors = [anchorBuilder({ quote: 'unique' })];
		const repaired = await service.authoring.repairForNote(note);
		expect(repaired[0]?.revision).toBe(2);
	});
});
