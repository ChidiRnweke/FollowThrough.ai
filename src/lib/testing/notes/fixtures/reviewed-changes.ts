import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
const noteMarkdown = new NodeNoteMarkdown();

import type { Note, NoteChangeReview, PreparedNoteChange } from '$lib/models/notes';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export const reviewedNoteFixture = (
	note: Note = noteBuilder(),
	markdown: NotesDependencies['markdown'] = {
		read: noteMarkdown.read,
		write: noteMarkdown.write
	}
) => {
	const content = new InMemoryNoteContent();
	content.notes = [note];
	const controller = new Notes(
		new BacklinkPresentationService(),
		new ReferencePresentationService(),
		new WorkspaceCommandRulesService(),
		new ProvenancePresentationService(),
		capabilityDependencies<NotesDependencies>({
			...agentToolResultsFixture(),
			archiveImport: new NoteArchiveImportService(),
			patchPreparation: new NotePatchPreparationService(),
			revisionComparison: new NoteRevisionComparisonService(),
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
