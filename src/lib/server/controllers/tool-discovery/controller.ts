import type { ToolDescriptor, ToolEmbeddingSeedSummary } from '$lib/models/agent/tool-index';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { ToolRanking, ToolSeeding } from '$lib/server/services/agent/tools/tool-search';

export interface ToolRetriever {
	retrieve(catalog: readonly ToolDescriptor[], query: string, topN: number): Promise<string[]>;
}

export interface ToolDiscoveryController extends ToolRetriever {
	seed(catalog?: readonly ToolDescriptor[]): Promise<ToolEmbeddingSeedSummary>;
}

interface TransactionRunner {
	run<T>(work: () => Promise<T>): Promise<T>;
}

export class ToolDiscovery implements ToolDiscoveryController {
	constructor(
		private readonly search: ToolSeeding & ToolRanking,
		private readonly transactions: TransactionRunner,
		private readonly catalog: Pick<AgentToolCatalog, 'discoverable'>
	) {}

	retrieve(catalog: readonly ToolDescriptor[], query: string, topN: number): Promise<string[]> {
		return this.search.rank(
			catalog.map((tool) => tool.name),
			query,
			topN
		);
	}

	async seed(
		catalog: readonly ToolDescriptor[] = this.catalog.discoverable()
	): Promise<ToolEmbeddingSeedSummary> {
		const seed = await this.search.prepareSeed(catalog);
		return this.transactions.run(() => this.search.completeSeed(seed));
	}
}
