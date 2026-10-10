import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import AdmZip from 'adm-zip';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import {
	readMarkdownArchive,
	parseMarkdownNote,
	describeArchiveRejection
} from '$lib/remote/notes/archive-reader.server';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export const archiveBytes = (files: Readonly<Record<string, string>>): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files)) zip.addFile(path, Buffer.from(content));
	return new Uint8Array(zip.toBuffer());
};

export const importedNotesFixture = () => {
	const records = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(records);
	projects.projects = [projectBuilder()];
	const catalog = createNoteServices(records, new InMemoryAnchorRepository(), projects);
	const consequences = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
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
			noteCreation: catalog.creator,
			noteEditor: catalog.editor,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: consequences,
			noteIndexer: consequences,
			markdown: { read: noteContentFromMarkdown, write: noteMarkdownFromContent },
			transactionRunner: new InMemoryTransactionRunner([records, consequences])
		})
	);
	const run = (files: Readonly<Record<string, string>>) => {
		const archive = readMarkdownArchive(archiveBytes(files));
		if (!archive.ok) throw new Error(describeArchiveRejection(archive.rejection));
		return controller.importMarkdownArchive(testActor(), {
			projectId: testProjectId(),
			notes: archive.result.entries.map(parseMarkdownNote),
			skipped: archive.result.skipped
		});
	};
	return { records, projects, consequences, controller, run };
};
