import type {
	ProjectConnectionsReport,
	ProjectContextUsageSummary
} from '$lib/models/context-usage';
import type { ProjectId } from '$lib/models/projects';
import type { ConnectionAnalysis } from '$lib/services/context-usage/connections';
import type {
	ProjectContextUsage,
	ProjectHoldings
} from '$lib/server/services/context-usage/usage';
import type { AttachmentReader } from '$lib/server/services/attachments/library';
import type { MemoryEntryLister } from '$lib/server/services/memory/library';
import type { ProjectTreeReader } from '$lib/server/services/projects/catalog';

/** What the agent drew on in one project, for the project's Agent context page. */
export interface ContextUsageController {
	/** @throws NotFoundError if the project is not the actor's. */
	forProject(projectId: ProjectId): Promise<ProjectContextUsageSummary>;
	/**
	 * What the agent read together in one project, what the user linked, and where they disagree.
	 * @throws NotFoundError if the project is not the actor's.
	 */
	connectionsFor(projectId: ProjectId): Promise<ProjectConnectionsReport>;
}

export interface ContextUsageDependencies {
	readonly usage: ProjectContextUsage;
	readonly connections: ConnectionAnalysis;
	readonly projectTree: ProjectTreeReader;
	readonly attachments: Pick<AttachmentReader, 'listForProject'>;
	readonly memory: MemoryEntryLister;
}

export class ContextUsage implements ContextUsageController {
	constructor(private readonly dependencies: ContextUsageDependencies) {}

	async forProject(projectId: ProjectId): Promise<ProjectContextUsageSummary> {
		return this.dependencies.usage.summarise(projectId, await this.holdings(projectId));
	}

	async connectionsFor(projectId: ProjectId): Promise<ProjectConnectionsReport> {
		const connections = await this.dependencies.usage.connect(
			projectId,
			await this.holdings(projectId)
		);
		const rules = this.dependencies.connections;
		return {
			...connections,
			mismatches: rules.mismatches(connections),
			ambient: rules.ambient(connections),
			defaultThreshold: rules.defaultThreshold(connections)
		};
	}

	private async holdings(projectId: ProjectId): Promise<ProjectHoldings> {
		// The tree read goes first: it is the one that refuses a project the actor does not own.
		const notes = await this.dependencies.projectTree.readEntries(projectId);
		const [attachments, memory] = await Promise.all([
			this.dependencies.attachments.listForProject(projectId),
			this.dependencies.memory.list({ projectId })
		]);
		return { notes, attachments, memory };
	}
}
