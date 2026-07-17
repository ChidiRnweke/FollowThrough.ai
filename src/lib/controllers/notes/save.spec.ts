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
import { noteEtag } from '$lib/models';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new DefaultNotesController({
		noteReader: content,
		noteTreeReader: content,
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

describe('Note synchronization invariants', () => {
	it('accepts a conditional save based on the current ETag', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		const result = await controller.sync(testActor(), {
			note: { ...note, plainText: 'Changed' },
			baseEtag: noteEtag(note),
			operationId: crypto.randomUUID()
		});
		expect(result.outcome).toBe('saved');
	});

	it('returns the remote version when a conditional save conflicts', async () => {
		const { content, controller } = setup();
		const base = noteBuilder();
		content.notes = [noteBuilder({ currentRevision: 2, plainText: 'Remote' })];
		const result = await controller.sync(testActor(), {
			note: { ...base, plainText: 'Local' },
			baseEtag: noteEtag(base),
			operationId: crypto.randomUUID()
		});
		expect(result.outcome === 'conflict' ? result.remote.note.plainText : undefined).toBe('Remote');
	});

	it('acknowledges a retried mutation that is already stored remotely', async () => {
		const { content, controller } = setup();
		const base = noteBuilder();
		content.notes = [noteBuilder({ currentRevision: 2, plainText: 'Same change' })];
		const result = await controller.sync(testActor(), {
			note: { ...base, plainText: 'Same change' },
			baseEtag: noteEtag(base),
			operationId: crypto.randomUUID()
		});
		expect(result.outcome).toBe('saved');
	});

	it('rejects a base ETag that does not describe the submitted revision', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await expect(
			controller.sync(testActor(), {
				note,
				baseEtag: noteEtag({ ...note, currentRevision: 2 }),
				operationId: crypto.randomUUID()
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('lists current ETags for ordinary notes', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note, noteBuilder({ id: testNoteId(2), kind: 'folder' })];
		const result = await controller.listSyncInventory(testActor(), {});
		expect(result.entries.map((entry) => entry.etag)).toEqual([noteEtag(note)]);
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
