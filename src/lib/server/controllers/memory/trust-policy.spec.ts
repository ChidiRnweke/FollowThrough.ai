import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { UpdateTrustPolicyInput } from '$lib/models/agent';
import { Memory, type MemoryDependencies } from './controller';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

interface Scenario {
	name: string;
	policy?: { actor: ActorContext; input: UpdateTrustPolicyInput };
	confidence?: number;
	accepted: boolean;
}
const memoryPolicy = (minimumConfidence?: UpdateTrustPolicyInput['minimumConfidence']) => ({
	actor: testActor(),
	input: { pipeline: 'memory' as const, autoAcceptEnabled: true, minimumConfidence }
});
const scenarios: readonly Scenario[] = [
	{ name: 'no policy', accepted: false, confidence: 100 },
	{
		name: 'disabled policy',
		policy: { actor: testActor(), input: { pipeline: 'memory', autoAcceptEnabled: false } },
		accepted: false,
		confidence: 100
	},
	{ name: 'below threshold', policy: memoryPolicy(80 as never), confidence: 79, accepted: false },
	{ name: 'missing confidence', policy: memoryPolicy(80 as never), accepted: false },
	{ name: 'exact threshold', policy: memoryPolicy(80 as never), confidence: 80, accepted: true },
	{ name: 'no threshold', policy: memoryPolicy(), accepted: true },
	{
		name: 'another actor policy',
		policy: { ...memoryPolicy(), actor: testActor(2) },
		confidence: 100,
		accepted: false
	},
	{
		name: 'another pipeline policy',
		policy: {
			actor: testActor(),
			input: { pipeline: 'extract_promises', autoAcceptEnabled: true }
		},
		confidence: 100,
		accepted: false
	}
];

it.each(scenarios)('persists the memory policy outcome for $name', async (scenario) => {
	const actor = testActor();
	const provenance = new InMemoryProvenanceRepository();
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: actor.userId,
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope: 'full' },
			createdAt: testNow
		}
	];
	const entries = new InMemoryMemoryEntryRepository();
	const library = createMemoryServices(entries, new InMemoryProjectRepository(), provenance);
	const records = new InMemorySuggestionRepository();
	const inbox = new SuggestionInbox(
		records,
		new InMemoryNoteRepository(),
		provenance,
		new InMemoryAnchorRepository()
	);
	const trust = new ToolTrust(new InMemoryTrustPolicyRepository());
	if (scenario.policy) await trust.upsert(scenario.policy.actor, scenario.policy.input);
	const effects = new InMemorySuggestionEffects();
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const index = createContentIndex(search, embeddings.model);
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryChanges: library.changes,
			suggestionCreator: inbox,
			suggestionAccepter: inbox,
			trustPolicyEvaluator: trust,
			suggestionEffects: effects,
			memoryIndexer: index.memories,
			indexWriter: index,
			indexEmbeddings: embeddings,
			transactionRunner: new InMemoryTransactionRunner([entries, effects, search])
		})
	);
	const result = await controller.propose(actor, {
		scope: 'user',
		operation: 'add',
		content: 'Prefer concise replies.',
		provenanceId: testProvenanceId(),
		confidence: scenario.confidence
	});
	const stored = await records.findById(actor, result.suggestion.id);
	expect({
		returned: result.suggestion,
		status: stored?.status,
		autoAccepted: stored?.isAutoAccepted,
		applied: result.appliedEntry,
		entries: await library.lister.list(actor, {}),
		effectCount: effects.repository.effects.size
	}).toEqual({
		returned: stored,
		status: scenario.accepted ? 'accepted' : 'proposed',
		autoAccepted: scenario.accepted,
		applied: scenario.accepted
			? expect.objectContaining({
					content: 'Prefer concise replies.',
					provenanceId: testProvenanceId()
				})
			: undefined,
		entries: scenario.accepted ? [result.appliedEntry] : [],
		effectCount: scenario.accepted ? 1 : 0
	});
});
