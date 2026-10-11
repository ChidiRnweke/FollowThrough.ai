import type { ActorContext } from '$lib/models/identity';
import {
	ProjectTreePresentationService,
	type ProjectTreePresentation
} from '$lib/services/projects/presentation';
import type { Database } from '$lib/server/db';
import type { ProjectRepository, ProjectTreeRepository } from '$lib/server/repositories/projects';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog, type ProjectLibrary } from '$lib/server/services/projects/catalog';
import {
	ProjectRules,
	type ProjectChoiceRules,
	type ProjectDetailRules,
	type ProjectPlacement
} from '$lib/services/projects/rules';
export interface ProjectServices {
	readonly catalog: ProjectLibrary;
	readonly choice: ProjectChoiceRules;
	readonly placement: ProjectPlacement;
	readonly details: ProjectDetailRules;
	readonly presentation: ProjectTreePresentation;
}
export const createProjectServices = (
	actor: ActorContext,
	repository: ProjectRepository,
	tree: ProjectTreeRepository
): ProjectServices => {
	const rules = new ProjectRules();
	return {
		catalog: new ProjectCatalog(repository, tree),
		choice: rules,
		details: rules,
		presentation: new ProjectTreePresentationService(),
		placement: rules
	};
};
export interface ProjectsCapabilityInput {
	readonly db: Database;
}
export interface ProjectsCapability extends ProjectServices {
	readonly repository: ProjectRepository & ProjectTreeRepository;
}
export const createProjectsCapability = (
	actor: ActorContext,
	input: ProjectsCapabilityInput
): ProjectsCapability => {
	const repository = new ProjectRecords(actor, input.db);
	return { repository, ...createProjectServices(actor, repository, repository) };
};
