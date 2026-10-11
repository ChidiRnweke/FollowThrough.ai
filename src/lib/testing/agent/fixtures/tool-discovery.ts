import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { ToolDiscovery } from '$lib/server/controllers/tool-discovery/controller';
import { ToolSearch } from '$lib/server/services/agent/tools/tool-search';
import type { ToolDescriptor, ToolEmbeddingWrite } from '$lib/models/agent/tool-index';
import type { ToolEmbeddingRepository } from '$lib/server/repositories/agent/tool-embeddings';
import {
	InMemoryToolEmbeddingRepository,
	InMemoryToolEmbeddings
} from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

export const toolCatalogFixture: readonly ToolDescriptor[] = [
	{ name: 'create_note', description: 'Create a note', retrievalText: 'write a new note' },
	{ name: 'archive_note', description: 'Archive a note' },
	{ name: 'pin_note', description: 'Pin a note' }
];

/** The real tool search service over a supplied store and an in-memory provider. */
export const toolSearchFixture = (
	repository: ToolEmbeddingRepository,
	embeddings: InMemoryToolEmbeddings = new InMemoryToolEmbeddings()
): ToolSearch =>
	new ToolSearch({
		repository,
		provider: embeddings.client,
		model: embeddings.model,
		tokens: testTokenizer,
		observer: { run: (_name, _context, body) => body() }
	});

export const storedTool = async (
	tool: ToolDescriptor,
	embedding: readonly number[] = [1, 0],
	model = 'test-model'
): Promise<ToolEmbeddingWrite> => {
	const repository = new InMemoryToolEmbeddingRepository();
	const embeddings = new InMemoryToolEmbeddings(model);
	embeddings.vectors = [embedding];
	const search = toolSearchFixture(repository, embeddings);
	await search.completeSeed(await search.prepareSeed([tool]));
	const row = repository.rows.get(tool.name);
	if (!row) throw new Error('Seeded tool is missing');
	return row;
};

export const toolDiscoveryFixture = async (
	rows: readonly (ToolEmbeddingWrite | Promise<ToolEmbeddingWrite>)[] = []
) => {
	const repository = new InMemoryToolEmbeddingRepository(await Promise.all(rows));
	const embeddings = new InMemoryToolEmbeddings();
	const controller = new ToolDiscovery(
		toolSearchFixture(repository, embeddings),
		new InMemoryTransactionRunner([repository]),
		new AgentToolCatalogService()
	);
	return { repository, embeddings, controller };
};
