import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag } from '$lib/models/notes';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteReader: content,
			noteEditor: content,
			noteLinkReconciler: content,
			notePublisher: content,
			revisionRecorder: content,
			revisionReader: content,
			attachmentRestorer: content,
			anchorRepairer: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	return { content, controller };
};

/**
 * Publishes the note as it stands, then edits it, so there is one snapshot to go back to
 * and a current body that differs from it.
 */
const publishThenEdit = async (
	content: InMemoryNoteContent,
	controller: Notes,
	nextText: string
) => {
	const current = content.notes[0]!;
	await controller.publish(testActor(), { noteId: current.id, baseEtag: noteEtag(current) });
	await controller.save(testActor(), { note: { ...content.notes[0]!, plainText: nextText } });
	const { revisions } = await controller.listRevisions(testActor(), { noteId: current.id });
	return revisions[0]!;
};

describe('Note revision restore invariants', () => {
	it('brings back the snapshot’s body', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		const result = await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		expect(result.note.plainText).toBe('Original');
	});

	it('brings back the snapshot’s title', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ title: 'First name', plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		content.notes = [{ ...content.notes[0]!, title: 'Second name' }];
		const result = await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		expect(result.note.title).toBe('First name');
	});

	// History stays append-only: the rollback lands as a new revision, so the version it
	// replaced is still in the list and the rollback is itself undoable.
	it('copies the snapshot forward rather than rewinding the revision counter', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		const result = await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		expect(result.note.currentRevision).toBeGreaterThan(revision.revision);
	});

	it('leaves the restored snapshot in the history', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		const { revisions } = await controller.listRevisions(testActor(), { noteId: testNoteId() });
		expect(revisions.map((entry) => entry.id)).toContain(revision.id);
	});

	// A rolled-back document must not render against files that moved on without it.
	it('restores the attachments the snapshot was taken with', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		expect(content.restoredAttachmentRevisionIds).toEqual([revision.id]);
	});

	it('reindexes the note so search reflects the restored body', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder({ plainText: 'Original' })];
		const revision = await publishThenEdit(content, controller, 'Rewritten');
		content.indexedNoteIds = [];
		await controller.restoreRevision(testActor(), {
			noteId: testNoteId(),
			revisionId: revision.id
		});
		expect(content.indexedNoteIds).toEqual([testNoteId()]);
	});

	it('rejects restoring a revision that does not belong to the note', async () => {
		const { content, controller } = setup();
		content.notes = [noteBuilder()];
		await expect(
			controller.restoreRevision(testActor(), {
				noteId: testNoteId(),
				revisionId: `${testNoteId(2)}:r1` as never
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
