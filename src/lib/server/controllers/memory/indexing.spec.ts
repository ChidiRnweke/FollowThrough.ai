import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { describe, expect, it } from 'vitest';
import { Memory, type MemoryDependencies } from './controller';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
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
	const indexWriter = createContentIndex(search, indexEmbeddings.model);
	const memory = createMemoryServices(entries, projects, new InMemoryProvenanceRepository());
	const controller = new Memory(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<MemoryDependencies>({
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryCreator: memory.creator,
			memoryEditor: memory.editor,
			memoryDeleter: memory.deleter,
			memoryIndexer: indexWriter.memories,
			indexEmbeddings,
			indexWriter,
			transactionRunner: new InMemoryTransactionRunner([entries, search])
		})
	);
	return { controller, search, entries, indexEmbeddings };
};
describe('Memory persistence and search', () => {
	it('rolls back the memory when immediate embedding fails', async () => {
		const { controller, entries, indexEmbeddings } = setup();
		indexEmbeddings.failure = new Error('Provider unavailable');
		await controller.create(testActor(), { projectId: testProjectId(), content: 'Fact' }).then(
			() => {
				throw new Error('Expected embedding failure');
			},
			(error) => {
				if (error !== indexEmbeddings.failure) throw error;
			}
		);
		expect(entries.entries).toEqual([]);
	});

	it('makes a shared memory searchable by vector before an immediate write returns', async () => {
		const { controller, search } = setup();
		const { entry } = await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		const matches = await search.searchByEmbedding(testActor(), [1, 0, 4], 10);
		expect({
			searchableIds: matches.map(({ document }) => document.memoryEntryId),
			chunkIds: search.documents.map((item) => item.document.memoryEntryId)
		}).toEqual({ searchableIds: [entry.id], chunkIds: [entry.id] });
	});
	it('does not index an entry withheld from agents', async () => {
		const { search, controller } = await setup();
		await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact',
			shareWithAgents: false
		});
		expect(search.documents).toEqual([]);
	});
	it('removes chunks when sharing is switched off', async () => {
		const { search, controller } = await setup();
		const { entry } = await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		await controller.update(testActor(), { memoryEntryId: entry.id, shareWithAgents: false });
		expect(search.documents).toEqual([]);
	});
	it('reindexes edited content', async () => {
		const { search, controller } = await setup();
		const { entry } = await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Old fact'
		});
		await controller.update(testActor(), { memoryEntryId: entry.id, content: 'New fact' });
		expect(search.documents[0]?.document.content).toBe('New fact');
	});
	it('removes chunks when an entry is removed', async () => {
		const { search, controller } = await setup();
		const { entry } = await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		await controller.remove(testActor(), { memoryEntryId: entry.id });
		expect(search.documents).toEqual([]);
	});
	it('keeps profile entries out of the retrieval index', async () => {
		const { search, controller } = await setup();
		await controller.create(testActor(), { content: 'I lead the platform team.' });
		expect(search.documents).toEqual([]);
	});
	it('rolls back a memory write when its search update fails', async () => {
		const { controller, search, entries } = setup();
		search.stageFailure = new Error('Search unavailable');
		await controller.create(testActor(), { projectId: testProjectId(), content: 'Fact' }).then(
			() => {
				throw new Error('Expected failure');
			},
			(error) => {
				if (!(error instanceof Error) || error.message !== 'Search unavailable') throw error;
			}
		);
		expect(entries.entries).toEqual([]);
	});
});
