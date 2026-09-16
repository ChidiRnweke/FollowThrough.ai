import { describe, expect, it } from 'vitest';
import { Memory, type MemoryDependencies } from './controller';
import { MemoryLibrary } from '$lib/server/services/memory/library';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testProjectId,
	projectBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const search = new InMemorySearchRepository();
	const indexEmbeddings = new InMemoryEmbeddingClient();
	const indexWriter = new ContentIndex(search, indexEmbeddings.model);
	const memory = new MemoryLibrary(entries, projects, new InMemoryProvenanceRepository());
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryIndexer: indexWriter.memories,
			indexEmbeddings,
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
