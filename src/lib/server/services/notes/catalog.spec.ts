import { describe, expect, it } from 'vitest';
import { NoteCatalog } from './catalog';
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
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = new NoteCatalog(notes, anchors, projects);
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
		const listed = await service.list(testActor());
		expect(listed.map((note) => note.id)).toEqual([testNoteId(), testNoteId(2)]);
	});

	// Publishing is the only thing that writes history, so the cap is enforced there.
	it('keeps only the newest snapshots once the retention limit is passed', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		for (let revision = 1; revision <= NOTE_REVISION_HISTORY_LIMIT + 3; revision += 1)
			await service.record(testActor(), noteBuilder({ currentRevision: revision }));
		expect(await notes.listRevisions(testActor(), testNoteId())).toHaveLength(
			NOTE_REVISION_HISTORY_LIMIT
		);
	});

	it('evicts the oldest snapshot rather than the newest', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		for (let revision = 1; revision <= NOTE_REVISION_HISTORY_LIMIT + 3; revision += 1)
			await service.record(testActor(), noteBuilder({ currentRevision: revision }));
		const kept = await notes.listRevisions(testActor(), testNoteId());
		expect(kept.map((entry) => entry.revision)).toContain(NOTE_REVISION_HISTORY_LIMIT + 3);
	});

	it('lists a trashed note in the trash', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		expect(await service.listTrashed(testActor())).toHaveLength(1);
	});

	it('keeps active notes out of the trash', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		expect(await service.listTrashed(testActor())).toEqual([]);
	});

	it('leaves an ambiguous anchor unchanged during repair', async () => {
		const { service, notes, anchors } = setup();
		const note = noteBuilder({ plainText: 'same and same', currentRevision: 2 });
		notes.notes = [note];
		anchors.anchors = [anchorBuilder({ quote: 'same', from: 0, to: 4 })];
		await service.repairForNote(testActor(), note);
		expect(anchors.anchors[0]?.revision).toBe(1);
	});

	it('repairs an unambiguous anchor to the new revision', async () => {
		const { service, notes, anchors } = setup();
		const note = noteBuilder({ plainText: 'prefix unique suffix', currentRevision: 2 });
		notes.notes = [note];
		anchors.anchors = [anchorBuilder({ quote: 'unique' })];
		const repaired = await service.repairForNote(testActor(), note);
		expect(repaired[0]?.revision).toBe(2);
	});
});
