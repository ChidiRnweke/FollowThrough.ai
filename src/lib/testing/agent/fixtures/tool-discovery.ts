import { ToolDiscovery } from '$lib/server/controllers/tool-discovery/controller';
import { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { ToolDescriptor, ToolEmbeddingWrite } from '$lib/models/agent/tool-index';
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

export const storedTool = async (
	tool: ToolDescriptor,
	embedding: readonly number[] = [1, 0],
	model = 'test-model'
): Promise<ToolEmbeddingWrite> => {
	const repository = new InMemoryToolEmbeddingRepository();
	const index = new ToolCatalogIndex(repository);
	const plan = await index.prepare([tool], model);
	await index.complete(plan, { model, vectors: [embedding] });
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
		new ToolCatalogIndex(repository),
		embeddings,
		new InMemoryTransactionRunner([repository])
	);
	return { repository, embeddings, controller };
};
