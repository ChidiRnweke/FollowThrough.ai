import { expect, it } from 'vitest';
import { AgentTools, McpTools } from './agent-tool-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { Memory, type MemoryDependencies } from '$lib/server/controllers/memory/controller';
import { MemoryLibrary } from '$lib/server/services/memory/library';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemoryTrustPolicyEvaluator } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testConversationId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { AgentRunId } from '$lib/models/agent';
import type { Provenance } from '$lib/models/provenance';

const setup = (surface: 'agent' | 'mcp', trusted = false) => {
	const actor = testActor();
	const provenance = new InMemoryProvenanceRepository();
	const identity = { id: testProvenanceId(), userId: actor.userId, createdAt: testNow };
	const origin: Provenance =
		surface === 'agent'
			? {
					...identity,
					producerKind: 'agent',
					producerName: 'FollowThrough Workbench Agent',
					pipeline: 'agent',
					runId: '00000000-0000-4000-8000-000000000228' as AgentRunId,
					model: 'test/model',
					metadata: {}
				}
			: {
					...identity,
					producerKind: 'agent',
					producerName: 'MCP client',
					pipeline: 'agent',
					metadata: { scope: 'full' }
				};
	provenance.provenance = [origin];
	const entries = new InMemoryMemoryEntryRepository();
	const library = new MemoryLibrary(entries, new InMemoryProjectRepository(), provenance);
	const suggestions = new InMemorySuggestions();
	const effects = new InMemorySuggestionEffects();
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const index = new ContentIndex(search, embeddings.model);
	const trust = new InMemoryTrustPolicyEvaluator();
	trust.autoAccept = trusted;
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			memoryChanges: library,
			suggestionCreator: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: effects,
			memoryIndexer: index.memories,
			indexWriter: index,
			indexEmbeddings: embeddings,
			trustPolicyEvaluator: trust,
			transactionRunner: new InMemoryTransactionRunner([entries, suggestions, effects, search])
		})
	);
	const factory = capabilityDependencies<ControllerFactory>({ memory: () => controller });
	const tools =
		surface === 'agent'
			? new AgentTools(
					factory,
					actor,
					'auto_accept',
					{
						provenanceId: origin.id,
						input: { conversationId: testConversationId(), prompt: 'Remember this' },
						model: 'test/model'
					},
					{ execute: (_input, action) => action() },
					new InMemoryToolRetriever(),
					{ isEnabled: () => true }
				)
			: new McpTools(factory, actor, { provenanceId: origin.id }, { isEnabled: () => true });
	const tool = tools.definitions().find((item) => item.name === 'propose_memory_change');
	if (!tool) throw new Error('Memory proposal tool is missing');
	const propose = () =>
		tool.prepare({ scope: 'user', operation: 'add', content: 'Prefer concise answers.' }).execute();
	return { propose, tool, origin, provenance, suggestions, entries };
};
it.each(['agent', 'mcp'] as const)(
	'retains the %s caller source on a pending memory proposal',
	async (surface) => {
		const { propose, origin, suggestions } = setup(surface);
		await propose();
		expect(suggestions.suggestions[0]?.provenanceId).toBe(origin.id);
	}
);
it('retains the caller source on an automatically applied memory', async () => {
	const { propose, origin, entries } = setup('agent', true);
	await propose();
	expect(entries.entries[0]?.provenanceId).toBe(origin.id);
});
it('does not replace the known source with a generic memory source', async () => {
	const { propose, origin, provenance } = setup('agent');
	await propose();
	expect(provenance.provenance).toEqual([origin]);
});

it('rejects a model-supplied source identifier', async () => {
	const { tool } = setup('agent');
	expect(() =>
		tool
			.prepare({
				scope: 'user',
				operation: 'add',
				content: 'Prefer concise answers.',
				provenanceId: testProvenanceId(2)
			})
			.execute()
	).toThrow('provenanceId');
});
