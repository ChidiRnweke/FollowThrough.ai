import type { IEmbeddingBatching } from '$lib/server/services/knowledge-search/embedding-batching';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { ToolDescriptor, ToolEmbeddingSeedSummary } from '$lib/models/agent/tool-index';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
import type { IToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { EmbeddingClient, EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';

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
		private readonly index: IToolCatalogIndex,
		private readonly embeddings: EmbeddingClient,
		private readonly batching: IEmbeddingBatching,
		private readonly transactions: TransactionRunner,
		private readonly catalog: Pick<AgentToolCatalog, 'discoverable'>
	) {}

	async retrieve(
		catalog: readonly ToolDescriptor[],
		query: string,
		topN: number
	): Promise<string[]> {
		if (!catalog.length) return [];
		const batch = await this.embeddings.embed([query]);
		const vector = batch.vectors[0];
		if (batch.vectors.length !== 1 || !vector)
			throw new InvalidGeneratedContentError('Tool search requires one query embedding');
		return this.index.rank(
			catalog.map((tool) => tool.name),
			vector,
			batch.model,
			topN
		);
	}

	async seed(
		catalog: readonly ToolDescriptor[] = this.catalog.discoverable()
	): Promise<ToolEmbeddingSeedSummary> {
		const plan = await this.index.prepare(catalog, this.embeddings.model);
		const batches: EmbeddingBatch[] = [];
		for (const contents of this.batching.batches(plan.pending.map((entry) => entry.input))) {
			batches.push(await this.embeddings.embed(contents));
		}
		const batch = this.batching.combine(plan.model, batches);
		return this.transactions.run(() => this.index.complete(plan, batch));
	}
}
