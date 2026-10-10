import type { IToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
export interface AgentToolDiscoveryServices {
	readonly index: Pick<IToolCatalogIndex, 'rank'>;
	readonly embeddings: Pick<EmbeddingClient, 'embed'>;
}
