import { expect, it } from 'vitest';
import { ToolDiscovery } from './controller';
import { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import { EmbeddingBatching } from '$lib/server/services/knowledge-search/embedding-batching';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { InMemoryToolEmbeddingRepository } from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

const catalog = ['alpha', 'beta', 'gamma'].map((name) => ({
	name,
	description: name,
	retrievalText: `${name} ${'word '.repeat(20_000)}`
}));
const setup = async () => {
	const repository = new InMemoryToolEmbeddingRepository();
	const index = new ToolCatalogIndex(repository);
	const embeddings = new InMemoryEmbeddingClient();
	const plan = await index.prepare(catalog, embeddings.model);
	const controller = new ToolDiscovery(
		index,
		embeddings,
		new EmbeddingBatching(testTokenizer),
		new InMemoryTransactionRunner([repository]),
		new AgentToolCatalogService()
	);
	return { repository, embeddings, plan, controller };
};

it('completes the catalog with vectors in input order across sequential batches', async () => {
	const fixture = await setup();
	await fixture.controller.seed(catalog);
	expect(
		[...fixture.repository.rows.values()].map((row) => ({ name: row.name, vector: row.embedding }))
	).toEqual(
		fixture.plan.pending.map((entry, index) => ({
			name: entry.name,
			vector: [index + 1, 0, entry.input.length]
		}))
	);
});

it('does not publish earlier batches when a later provider request fails', async () => {
	const fixture = await setup();
	fixture.embeddings.rejectedContents.add(fixture.plan.pending[1].input);
	const outcome = await fixture.controller.seed(catalog).then(
		() => 'success',
		(error: Error) => error.message
	);
	expect({
		outcome,
		rows: [...fixture.repository.rows.values()],
		completedProviderBatches: fixture.embeddings.generation - 1
	}).toEqual({ outcome: 'Embedding rejected this content', rows: [], completedProviderBatches: 1 });
});
