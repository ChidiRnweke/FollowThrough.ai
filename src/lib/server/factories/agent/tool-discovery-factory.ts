import type { IToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
export interface AgentToolDiscoveryServices {
	readonly index: Pick<IToolCatalogIndex, 'rank'>;
	readonly embeddings: Pick<IEmbeddings, 'embed'>;
}
