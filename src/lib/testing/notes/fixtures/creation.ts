import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const noteCreationControllers = (catalog: NoteCatalog) => ({
	notes: new Notes(capabilityDependencies<NotesDependencies>({ noteCreation: catalog })),
	projects: new Projects(capabilityDependencies<ProjectsDependencies>({ noteCreation: catalog }))
});
