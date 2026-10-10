import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import type { NoteCreator } from '$lib/server/services/notes/catalog';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const noteCreationControllers = (
	catalog: NoteCreator,
	transactionRunner: TransactionRunner
) => ({
	notes: new Notes(
		capabilityDependencies<NotesDependencies>({
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
			noteCreation: catalog,
			transactionRunner
		})
	),
	projects: new Projects(
		capabilityDependencies<ProjectsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			noteCreation: catalog,
			transactionRunner
		})
	)
});
