import {
	ProjectTreePresentationService,
	type ProjectTreePresentation
} from '$lib/services/projects/presentation';
import { ProjectDetailService, type ProjectDetailRules } from '$lib/services/projects/details';
import type { Database } from '$lib/server/db';
import type { ProjectRepository, ProjectTreeRepository } from '$lib/server/repositories/projects';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import {
	ProjectCreationService,
	type ProjectCreator,
	ProjectReadingService,
	type ProjectReader,
	type ProjectLister,
	ProjectEditingService,
	type ProjectEditor,
	ProjectLifecycleService,
	type ProjectLifecycle,
	ProjectTreeService,
	type ProjectTreeReader,
	type ProjectTreeWriter
} from '$lib/server/services/projects/catalog';
import { ProjectPlacementService, type ProjectPlacement } from '$lib/services/projects/placement';
export interface ProjectServices {
	readonly creator: ProjectCreator;
	readonly reader: ProjectReader;
	readonly lister: ProjectLister;
	readonly editor: ProjectEditor;
	readonly lifecycle: ProjectLifecycle;
	readonly treeReader: ProjectTreeReader;
	readonly treeWriter: ProjectTreeWriter;
	readonly placement: ProjectPlacement;
	readonly details: ProjectDetailRules;
	readonly presentation: ProjectTreePresentation;
}
export const createProjectServices = (
	repository: ProjectRepository,
	tree: ProjectTreeRepository
): ProjectServices => {
	const reader = new ProjectReadingService(repository);
	const entries = new ProjectTreeService(repository, tree);
	return {
		creator: new ProjectCreationService(repository),
		reader,
		lister: reader,
		editor: new ProjectEditingService(repository),
		lifecycle: new ProjectLifecycleService(repository),
		treeReader: entries,
		treeWriter: entries,
		details: new ProjectDetailService(),
		presentation: new ProjectTreePresentationService(),
		placement: new ProjectPlacementService()
	};
};
export interface ProjectsCapabilityInput {
	readonly db: Database;
}
export interface ProjectsCapability extends ProjectServices {
	readonly repository: ProjectRepository & ProjectTreeRepository;
}
export const createProjectsCapability = (input: ProjectsCapabilityInput): ProjectsCapability => {
	const repository = new ProjectRecords(input.db);
	return { repository, ...createProjectServices(repository, repository) };
};
