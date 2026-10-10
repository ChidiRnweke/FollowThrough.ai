import type { Project } from '$lib/models/projects';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { agentToolResultsFixture } from './tool-results';
export const agentProjectsFixture = (projects: Project[] = []) => {
	const repository = new InMemoryProjectRepository();
	repository.projects = projects;
	const services = createProjectServices(repository, repository);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			projectLister: services.lister
		})
	);
	const factory = capabilityDependencies<ControllerFactory>({ projects: () => controller });
	return { repository, controller, factory };
};
