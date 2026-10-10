import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { EmbeddingBatching } from '$lib/server/services/knowledge-search/embedding-batching';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Memory, type MemoryDependencies } from './controller';
const setup = () => {
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const search = new InMemorySearchRepository();
	const indexEmbeddings = new InMemoryEmbeddingClient();
	const indexWriter = createContentIndex(search, indexEmbeddings.model);
	const memory = createMemoryServices(entries, projects, new InMemoryProvenanceRepository());
	const controller = new Memory(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<MemoryDependencies>({
			...agentToolResultsFixture(),
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryCreator: memory.creator,
			memoryEditor: memory.editor,
			memoryDeleter: memory.deleter,
			memoryIndexer: indexWriter,
			indexEmbeddings,
			embeddingBatching: new EmbeddingBatching(testTokenizer),
			indexWriter,
			transactionRunner: new InMemoryTransactionRunner([entries, search])
		})
	);
	return { controller, search, entries, indexEmbeddings };
};

describe('Memory edit preparation', () => {
	it('rejects an empty memory entry before persistence', async () => {
		const { controller } = setup();
		await expect(
			controller.create(testActor(), { projectId: testProjectId(), content: '   ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('rejects an edit that empties memory content', async () => {
		const { controller } = setup();
		const { entry } = await controller.create(testActor(), { content: 'Retain this fact' });
		await expect(
			controller.update(testActor(), { memoryEntryId: entry.id, content: '  ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('does not edit a removed memory entry', async () => {
		const { controller } = setup();
		const { entry } = await controller.create(testActor(), { content: 'Retain this fact' });
		await controller.remove(testActor(), { memoryEntryId: entry.id });
		await expect(
			controller.update(testActor(), { memoryEntryId: entry.id, content: 'Changed fact' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
