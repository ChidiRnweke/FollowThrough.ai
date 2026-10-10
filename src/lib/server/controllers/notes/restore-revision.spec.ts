import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
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
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
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

describe('Note revision restore invariants', () => {
	it('restores snapshot content, title, history, attachments, and search index together', async () => {
		const { content, controller } = setup();
		const originalBody = noteContentFromMarkdown('# Snapshot heading\n\nThe original **body**.');
		content.notes = [noteBuilder({ ...originalBody, title: 'First name' })];
		const publishedNote = content.notes[0]!;
		await controller.publish(testActor(), {
			noteId: publishedNote.id,
			baseEtag: noteEtag(publishedNote.id, publishedNote.currentRevision)
		});
		const changedBody = noteContentFromMarkdown('# Current heading\n\nThe changed *body*.');
		await controller.save(testActor(), {
			note: { ...content.notes[0]!, ...changedBody, title: 'Second name' }
		});
		const { revisions: savedRevisions } = await controller.listRevisions(testActor(), {
			noteId: publishedNote.id
		});
		const revision = savedRevisions[0]!;
		content.indexedNoteIds = [];
		const result = await controller.restoreRevision(testActor(), {
			noteId: publishedNote.id,
			revisionId: revision.id
		});
		expect({ document: result.note.document, plainText: result.note.plainText }).toEqual(
			originalBody
		);
		expect(result.note.title).toBe('First name');
		expect(result.note.currentRevision).toBeGreaterThan(revision.revision);
		const { revisions } = await controller.listRevisions(testActor(), { noteId: publishedNote.id });
		expect(revisions.map((entry) => entry.id)).toContain(revision.id);
		expect(content.restoredAttachmentRevisionIds).toEqual([revision.id]);
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
