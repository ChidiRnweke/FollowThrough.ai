import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import type { AgentToolDiscoveryStore } from '$lib/server/stores/agent/tool-discovery';

export interface ToolDiscoveryPresentation {
	describe(names: readonly string[]): AgentPayload;
}
export interface AgentToolDiscoveryControl {
	search(query: string, limit: number): Promise<AgentPayload>;
	isEnabled(name: string): boolean;
}

/** Ranking cannot grant authority: only names in this execution's permitted set are promoted. */
export class AgentToolDiscovery implements AgentToolDiscoveryControl {
	constructor(
		private readonly catalog: readonly ToolDescriptor[],
		private readonly permitted: readonly string[],
		private readonly state: AgentToolDiscoveryStore,
		private readonly retriever: ToolRetriever,
		private readonly presentation: ToolDiscoveryPresentation,
		private readonly catalogRules: Pick<AgentToolCatalog, 'isFirstClass'>
	) {}

	isEnabled(name: string): boolean {
		return this.state.has(name);
	}

	async search(query: string, limit: number): Promise<AgentPayload> {
		const ranked = await this.retriever.retrieve(
			this.catalog.filter((entry) => !this.catalogRules.isFirstClass(entry.name)),
			query,
			limit
		);
		const permitted = new Set(this.permitted);
		const matches = ranked.filter((name) => permitted.has(name));
		this.state.add(matches);
		return this.presentation.describe(matches);
	}
}
