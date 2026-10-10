import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { ToolPreferenceCapability } from '$lib/server/services/agent/tools/preferences';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
export interface AgentToolSessionControl {
	authority(actor: ActorContext, projectId?: ProjectId): Promise<readonly string[]>;
}
/** Resolve live user/project authority from services for each execution. */
export class AgentToolSessions implements AgentToolSessionControl {
	constructor(
		private readonly preferences: ToolPreferenceCapability,
		private readonly catalog: AgentToolCatalog
	) {}
	async authority(actor: ActorContext, projectId?: ProjectId): Promise<readonly string[]> {
		const preferences = await this.preferences.view(actor, this.catalog.entries(), projectId);
		return preferences
			.filter((preference) => !preference.enabled)
			.map((preference) => preference.name);
	}
}
