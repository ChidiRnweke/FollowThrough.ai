import { describe, expect, it } from 'vitest';
import { DefaultNotesController, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import {
	anchorBuilder,
	noteBuilder,
	testActor,
	testAnchorId,
	testNoteId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new DefaultNotesController({
		noteEditor: content,
		revisionRecorder: content,
		anchorRepairer: content,
		noteIndexer: content,
		transactionRunner: new InMemoryTransactionRunner([content])
	} as unknown as NotesDependencies);
	return { content, controller };
};

describe('Note revision invariants', () => {
	it('increments the revision for a meaningful edit', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		const result = await controller.save(testActor(), {
			note: { ...note, plainText: 'Changed' }
		});
		expect(result.note.currentRevision).toBe(2);
	});

	it('records an immutable snapshot for a meaningful edit', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await controller.save(testActor(), { note: { ...note, plainText: 'Changed' } });
		expect(content.revisions.map((revision) => revision.currentRevision)).toEqual([2]);
	});

	it('does not duplicate an existing snapshot for a no-op save', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.revisions = [note];
		await controller.save(testActor(), { note });
		expect(content.revisions).toHaveLength(1);
	});

	it('rejects a stale revision', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ currentRevision: 2 })];
		await expect(
			controller.save(testActor(), { note: noteBuilder({ currentRevision: 1 }) })
		).rejects.toMatchObject({ code: 'STALE_REVISION' });
	});

	it('returns repaired anchor identifiers', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.anchors = [anchorBuilder()];
		const result = await controller.save(testActor(), { note });
		expect(result.repairedAnchorIds).toEqual([testAnchorId()]);
	});
});

describe('Note save transaction invariants', () => {
	it('reports an indexing failure as an external-service error', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.failIndex = true;
		await expect(
			controller.save(testActor(), { note: { ...note, plainText: 'Changed' } })
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});

	it('rolls back the note when indexing fails', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.failIndex = true;
		try {
			await controller.save(testActor(), { note: { ...note, plainText: 'Changed' } });
		} catch {
			// The restored note is the invariant under test.
		}
		expect(content.notes[0]?.currentRevision).toBe(1);
	});

	it('rolls back the revision snapshot when indexing fails', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.failIndex = true;
		try {
			await controller.save(testActor(), { note: { ...note, plainText: 'Changed' } });
		} catch {
			// The restored revision collection is the invariant under test.
		}
		expect(content.revisions).toEqual([]);
	});

	it('does not expose another user’s note through save', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await expect(
			controller.save(testActor(2), { note: noteBuilder({ userId: testActor(2).userId }) })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('preserves the note identity after rollback', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		content.failIndex = true;
		try {
			await controller.save(testActor(), { note: { ...note, title: 'Changed' } });
		} catch {
			// The restored identity is the invariant under test.
		}
		expect(content.notes[0]?.id).toBe(testNoteId());
	});
});
