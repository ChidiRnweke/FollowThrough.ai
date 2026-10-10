import type { Note } from '$lib/models/notes';
import { noteEtag } from '$lib/models/notes';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
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
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
const content = (text: string): Pick<Note, 'plainText' | 'document'> => ({
	plainText: text,
	document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
});

it('discards against the publication that committed before it acquired the note', async () => {
	const records = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(records);
	projects.projects = [projectBuilder()];
	const catalog = createNoteServices(records, new InMemoryAnchorRepository(), projects);
	const effects = new InMemoryNoteContent();
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
			transactionRunner: new InMemoryTransactionRunner([records, effects]),
			noteReader: catalog.reader,
			noteEditor: catalog.editor,
			notePublisher: catalog.publisher,
			revisionRecorder: catalog.revisionRecorder,
			revisionReader: catalog.revisionReader,
			attachmentRestorer: catalog.attachmentRestorer,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
	const original = noteBuilder(content('First publication'));
	records.notes = [original];
	const first = await controller.publish(testActor(), {
		noteId: original.id,
		baseEtag: noteEtag(original.id, original.currentRevision)
	});
	const { note: draft } = await controller.save(testActor(), {
		note: { ...first.note, ...content('New publication') }
	});
	const paused = records.pauseNextWriteRead();
	const discarding = controller.discardDraft(testActor(), { noteId: original.id });
	await paused.started;
	try {
		const latest = await controller.publish(testActor(), {
			noteId: draft.id,
			baseEtag: noteEtag(draft.id, draft.currentRevision)
		});
		paused.release();
		expect((await discarding).note).toEqual(latest.note);
	} finally {
		paused.release();
	}
});
