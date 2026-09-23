import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const noteCreationControllers = (
	catalog: NoteCatalog,
	transactionRunner: TransactionRunner
) => ({
	notes: new Notes(
		capabilityDependencies<NotesDependencies>({ noteCreation: catalog, transactionRunner })
	),
	projects: new Projects(
		capabilityDependencies<ProjectsDependencies>({ noteCreation: catalog, transactionRunner })
	)
});
