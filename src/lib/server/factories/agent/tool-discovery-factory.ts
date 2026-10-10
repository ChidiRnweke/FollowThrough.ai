import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import type { ToolRetriever } from '$lib/server/controllers/tool-discovery/controller';
import {
	ToolCatalogBoundary,
	type ToolSchemaDefinition
} from '$lib/server/adapters/agent/tool-catalog';
import {
	AgentToolDiscovery,
	type AgentToolDiscoveryControl
} from '$lib/server/controllers/agent/tool-discovery';
import { AgentToolDiscoveryStore } from '$lib/server/stores/agent/tool-discovery';

export const createAgentToolDiscovery = (
	catalog: readonly ToolDescriptor[],
	definitions: readonly ToolSchemaDefinition[],
	retriever: ToolRetriever,
	alreadyPromoted: readonly string[]
): AgentToolDiscoveryControl =>
	new AgentToolDiscovery(
		catalog,
		definitions.map(({ name }) => name),
		new AgentToolDiscoveryStore(alreadyPromoted),
		retriever,
		new ToolCatalogBoundary(definitions),
		new AgentToolCatalogService()
	);
