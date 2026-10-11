import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
import type { ProjectId } from '$lib/models/projects';
import type { ProjectContextUsage } from '$lib/server/services/context-usage/usage';
import type { AttachmentReader } from '$lib/server/services/attachments/library';
import type { MemoryEntryLister } from '$lib/server/services/memory/library';
import type { ProjectTreeReader } from '$lib/server/services/projects/catalog';

/** What the agent drew on in one project, for the project's Agent context page. */
export interface ContextUsageController {
	/** @throws NotFoundError if the project is not the actor's. */
	forProject(projectId: ProjectId): Promise<ProjectContextUsageSummary>;
}

export interface ContextUsageDependencies {
	readonly usage: ProjectContextUsage;
	readonly projectTree: ProjectTreeReader;
	readonly attachments: Pick<AttachmentReader, 'listForProject'>;
	readonly memory: MemoryEntryLister;
}

export class ContextUsage implements ContextUsageController {
	constructor(private readonly dependencies: ContextUsageDependencies) {}

	async forProject(projectId: ProjectId): Promise<ProjectContextUsageSummary> {
		// The tree read goes first: it is the one that refuses a project the actor does not own.
		const notes = await this.dependencies.projectTree.readEntries(projectId);
		const [attachments, memory] = await Promise.all([
			this.dependencies.attachments.listForProject(projectId),
			this.dependencies.memory.list({ projectId })
		]);
		return this.dependencies.usage.summarise(projectId, { notes, attachments, memory });
	}
}
