import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
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
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository(testActor());
	const anchors = new InMemoryAnchorRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor());
	projects.projects = [projectBuilder()];
	const service = createNoteServices(testActor(), notes, anchors, projects, testClock);
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

	// The history limit is 20 snapshots; the repository keeps the newest ones.
	it('keeps every snapshot while the history is at the limit', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		for (let revision = 1; revision <= 20; revision += 1)
			await service.authoring.record(noteBuilder({ currentRevision: revision }));
		const kept = await notes.listRevisions(testNoteId());
		expect(kept.map((entry) => entry.revision).sort((left, right) => left - right)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 1)
		);
	});

	it('evicts the oldest snapshot once the history passes the limit', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		for (let revision = 1; revision <= 21; revision += 1)
			await service.authoring.record(noteBuilder({ currentRevision: revision }));
		const kept = await notes.listRevisions(testNoteId());
		expect(kept.map((entry) => entry.revision).sort((left, right) => left - right)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 2)
		);
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
