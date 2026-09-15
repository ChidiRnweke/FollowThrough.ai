import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { Note, PreparedNoteChange, NoteChangeReview } from '$lib/models/notes';

export const reviewedNoteFixture = (note: Note = noteBuilder()) => {
	const content = new InMemoryNoteContent();
	content.notes = [note];
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			markdown: { read: noteContentFromMarkdown, write: noteMarkdownFromContent },
			noteReader: content,
			noteEditor: content,
			anchorRepairer: content,
			noteLinkReconciler: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	const factory = capabilityDependencies<ControllerFactory>({ notes: () => controller });
	return { content, controller, factory };
};

export const requirePreparedChange = (review: NoteChangeReview): PreparedNoteChange => {
	if (review.kind !== 'prepared') throw new Error(review.problems.join('; '));
	return review.change;
};
