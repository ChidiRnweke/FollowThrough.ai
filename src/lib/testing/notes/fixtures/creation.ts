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
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			noteCreation: catalog,
			transactionRunner
		})
	),
	projects: new Projects(
		capabilityDependencies<ProjectsDependencies>({
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			noteCreation: catalog,
			transactionRunner
		})
	)
});
