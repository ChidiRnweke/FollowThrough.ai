import type { AuthoredLinkRecord } from '$lib/models/context-usage';
import type { ProjectId } from '$lib/models/projects';
import type { ProjectLinkRepository } from '$lib/server/repositories/context-usage';

/** The links each project's records state; a project with none stated has none. */
export class InMemoryProjectLinks implements ProjectLinkRepository {
	readonly projects = new Map<ProjectId, readonly AuthoredLinkRecord[]>();

	async read(projectId: ProjectId): Promise<readonly AuthoredLinkRecord[]> {
		return this.projects.get(projectId) ?? [];
	}
}
