import type { Database } from '$lib/server/db';
import type { ProjectRepository, ProjectTreeRepository } from '$lib/server/repositories/projects';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';

export interface ProjectsCapabilityInput {
	readonly db: Database;
}

export interface ProjectsCapability {
	readonly repository: ProjectRepository & ProjectTreeRepository;
	readonly catalog: ProjectCatalog;
}

export const createProjectsCapability = (input: ProjectsCapabilityInput): ProjectsCapability => {
	const repository = new ProjectRecords(input.db);
	return {
		repository,
		catalog: new ProjectCatalog(repository, repository)
	};
};
