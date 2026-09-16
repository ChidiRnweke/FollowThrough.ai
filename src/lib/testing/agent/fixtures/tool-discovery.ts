import { ToolDiscovery } from '$lib/server/controllers/tool-discovery/controller';
import { ToolCatalogIndex, toolContentHash } from '$lib/server/services/agent/tools/tool-index';
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

export const storedTool = (
	tool: ToolDescriptor,
	embedding: readonly number[] = [1, 0],
	model = 'test-model'
): ToolEmbeddingWrite => ({
	name: tool.name,
	description: tool.description,
	contentHash: toolContentHash(tool),
	embedding,
	embeddingModel: model
});

export const toolDiscoveryFixture = (rows: readonly ToolEmbeddingWrite[] = []) => {
	const repository = new InMemoryToolEmbeddingRepository(rows);
	const embeddings = new InMemoryToolEmbeddings();
	const controller = new ToolDiscovery(
		new ToolCatalogIndex(repository),
		embeddings,
		new InMemoryTransactionRunner([repository])
	);
	return { repository, embeddings, controller };
};
