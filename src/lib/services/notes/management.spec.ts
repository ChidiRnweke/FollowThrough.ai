import { describe, expect, it } from 'vitest';
import { NoteManagementService } from './management';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import {
	anchorBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const service = new NoteManagementService(notes, anchors, projects);
	return { service, notes, anchors };
};

describe('Note management invariants', () => {
	it('rejects a stale save without replacing the note', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ currentRevision: 2 })];
		await expect(
			service.save(testActor(), noteBuilder({ currentRevision: 1 }))
		).rejects.toMatchObject({
			code: 'STALE_REVISION'
		});
	});

	it('does not increment a no-op save', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const saved = await service.save(testActor(), noteBuilder());
		expect(saved.currentRevision).toBe(1);
	});

	it('increments a meaningful save exactly once', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const saved = await service.save(testActor(), noteBuilder({ title: 'Changed' }));
		expect(saved.currentRevision).toBe(2);
	});

	it('does not allow a content save to reorder siblings', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ position: 0 })];
		await expect(service.save(testActor(), noteBuilder({ position: 1 }))).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('rejects authored content in a folder', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ kind: 'folder' })];
		await expect(
			service.save(testActor(), noteBuilder({ kind: 'folder', plainText: 'content' }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects selection offsets outside the note', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ plainText: 'short' })];
		await expect(
			service.create(testActor(), {
				noteId: testNoteId(),
				revision: 1,
				from: 0,
				to: 99,
				text: 'short'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('archives an active note', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const archived = await service.archive(testActor(), testNoteId());
		expect(archived.archivedAt).toBeDefined();
	});

	it('rejects archiving a note that is already archived', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		await expect(service.archive(testActor(), testNoteId())).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('rejects archiving a folder with active contents', async () => {
		const { service, notes } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId() })
		];
		await expect(service.archive(testActor(), testNoteId())).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('archives a folder whose contents are all archived', async () => {
		const { service, notes } = setup();
		notes.notes = [
			noteBuilder({ kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), archivedAt: testNow })
		];
		const archived = await service.archive(testActor(), testNoteId());
		expect(archived.archivedAt).toBeDefined();
	});

	it('restores an archived note', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ archivedAt: testNow })];
		const restored = await service.restore(testActor(), testNoteId());
		expect(restored.archivedAt).toBeUndefined();
	});

	it('rejects restoring a note that is not archived', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		await expect(service.restore(testActor(), testNoteId())).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('does not expose another user’s note through archive', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		await expect(service.archive(testActor(2), testNoteId())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('rejects selection text that does not match its offsets', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder({ plainText: 'text' })];
		await expect(
			service.create(testActor(), {
				noteId: testNoteId(),
				revision: 1,
				from: 0,
				to: 4,
				text: 'Other'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
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
