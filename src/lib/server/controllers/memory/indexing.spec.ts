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
	const memory = new MemoryLibrary(entries, projects, new InMemoryProvenanceRepository());
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryIndexer: new ContentIndex(search, new InMemoryEmbeddingClient()).memories,
			transactionRunner: new InMemoryTransactionRunner([entries, search])
		})
	);
	return { controller, search, entries };
};
describe('Memory persistence and search', () => {
	it('indexes a shared entry into search chunks', async () => {
		const { search, controller } = await setup();
		await controller.create(testActor(), { projectId: testProjectId(), content: 'Fact' });
		expect(search.documents).toHaveLength(1);
	});
	it('marks memory-sourced chunks with the entry id', async () => {
		const { search, controller } = await setup();
		const { entry } = await controller.create(testActor(), {
			projectId: testProjectId(),
			content: 'Fact'
		});
		expect(search.documents[0]?.document.memoryEntryId).toBe(entry.id);
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
