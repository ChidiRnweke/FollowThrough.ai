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
		noteLinkReconciler: content,
		notePublisher: content,
		revisionRecorder: content,
		revisionReader: content,
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

	it('does not record a revision snapshot on draft save', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await controller.save(testActor(), { note: { ...note, plainText: 'Changed' } });
		expect(content.revisions).toHaveLength(0);
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

	it('does not create revisions even when indexing fails', async () => {
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

describe('Note publish invariants', () => {
	it('creates a revision snapshot on publish', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await controller.publish(testActor(), { noteId: note.id, baseEtag: noteEtag(note) });
		expect(content.revisions).toHaveLength(1);
		expect(content.revisions[0]?.currentRevision).toBe(note.currentRevision);
	});

	it('sets publishedRevision to currentRevision on the note', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		const result = await controller.publish(testActor(), {
			noteId: note.id,
			baseEtag: noteEtag(note)
		});
		expect(result.note.publishedRevision).toBe(note.currentRevision);
		expect(result.note.publishedAt).toBeDefined();
	});

	it('rejects a stale ETag on publish', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await expect(
			controller.publish(testActor(), {
				noteId: note.id,
				baseEtag: noteEtag({ ...note, currentRevision: 99 })
			})
		).rejects.toMatchObject({ code: 'STALE_REVISION' });
	});
});

describe('Note discard draft invariants', () => {
	it('restores content from the last published revision', async () => {
		const { content, controller } = setup();
		const note = noteBuilder({ plainText: 'Original' });
		content.notes = [note];
		// Publish the original
		await controller.publish(testActor(), { noteId: note.id, baseEtag: noteEtag(note) });
		// Edit (draft save)
		const saved = await controller.save(testActor(), {
			note: { ...content.notes[0]!, plainText: 'Draft change' }
		});
		expect(saved.note.plainText).toBe('Draft change');
		// Discard
		const discarded = await controller.discardDraft(testActor(), { noteId: note.id });
		expect(discarded.note.plainText).toBe('Original');
	});

	it('rejects discard when no published version exists', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await expect(controller.discardDraft(testActor(), { noteId: note.id })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

describe('Note link invariants', () => {
	/**
	 * Reconciliation runs inside the save transaction, so a committed body can never sit
	 * beside `mentions` rows describing the previous one.
	 */
	it('reconciles the links in the document it just saved', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await controller.save(testActor(), {
			note: {
				...note,
				plainText: 'see the decision',
				document: {
					type: 'doc',
					content: [
						{
							type: 'paragraph',
							content: [
								{
									type: 'text',
									marks: [{ type: 'noteLink', attrs: { noteId: testNoteId(2) } }],
									text: 'the decision'
								}
							]
						}
					]
				} as never
			}
		});
		expect(content.noteLinkTargets.get(note.id)).toEqual([testNoteId(2)]);
	});

	it('reconciles to no links when the document has none', async () => {
		const { content, controller } = setup();
		const note = noteBuilder();
		content.notes = [note];
		await controller.save(testActor(), { note: { ...note, plainText: 'Plain prose.' } });
		expect(content.noteLinkTargets.get(note.id)).toEqual([]);
	});
});
