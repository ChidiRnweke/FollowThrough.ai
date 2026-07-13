import type { ActorContext, Project, ProjectId } from '$lib/models';
import { DEFAULT_PROJECT_NAME, NotFoundError } from '$lib/models';
import type { ProjectRepository } from '$lib/repositories';

export async function ensureProjectForActor(
	repository: ProjectRepository,
	actor: ActorContext,
	projectId?: ProjectId
): Promise<Project> {
	if (projectId) {
		const project = await repository.findById(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}
	const existing = await repository.findFirstActive(actor);
	if (existing) return existing;
	return repository.insert(actor, { name: DEFAULT_PROJECT_NAME });
}
