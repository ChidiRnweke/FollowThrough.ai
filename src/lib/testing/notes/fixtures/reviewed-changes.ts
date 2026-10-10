import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
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

export const reviewedNoteFixture = (
	note: Note = noteBuilder(),
	markdown: NotesDependencies['markdown'] = {
		read: noteContentFromMarkdown,
		write: noteMarkdownFromContent
	}
) => {
	const content = new InMemoryNoteContent();
	content.notes = [note];
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			todoPresentation: new TodoPresentationService(),
			textSearch: new NoteTextSearchService(),
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			markdown,
			noteReader: content,
			revisionReader: content,
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
