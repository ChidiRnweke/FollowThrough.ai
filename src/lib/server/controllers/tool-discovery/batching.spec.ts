import { expect, it } from 'vitest';
import { ToolDiscovery } from './controller';
import { ToolSearch } from '$lib/server/services/agent/tools/tool-search';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { InMemoryToolEmbeddingRepository } from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

const catalog = ['alpha', 'beta', 'gamma'].map((name) => ({
	name,
	description: name,
	retrievalText: `${name} ${'word '.repeat(20_000)}`
}));
const setup = async () => {
	const repository = new InMemoryToolEmbeddingRepository();
	const embeddings = new InMemoryRetrievalProvider();
	const search = new ToolSearch({
		repository,
		provider: embeddings.client,
		model: 'fake-embedding-v1',
		tokens: testTokenizer,
		observer: { run: (_name, _context, body) => body() }
	});
	const plan = {
		pending: catalog.map((tool) => ({
			name: tool.name,
			input: `${tool.name}: ${tool.retrievalText}`
		}))
	};
	const controller = new ToolDiscovery(
		search,
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
	}).toEqual({ outcome: 'Embedding generation failed', rows: [], completedProviderBatches: 1 });
});
