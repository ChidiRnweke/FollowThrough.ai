import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import type { UpdateTrustPolicyInput } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	testActor,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Memory, type MemoryDependencies } from './controller';

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
	const provenance = new InMemoryProvenanceRepository(actor);
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
	const entries = new InMemoryMemoryEntryRepository(actor);
	const library = createMemoryServices(
		actor,
		entries,
		new InMemoryProjectRepository(actor),
		provenance
	);
	const records = new InMemorySuggestionRepository(actor);
	const inbox = createSuggestionServices(
		actor,
		records,
		new InMemoryNoteRepository(actor),
		provenance,
		new InMemoryAnchorRepository(actor)
	);
	const policies = new InMemoryTrustPolicyRepository(actor);
	const trust = new ToolTrust(actor, policies);
	if (scenario.policy) {
		// The scenario's account writes its policy; the policy table is shared by every account.
		const written = new InMemoryTrustPolicyRepository(scenario.policy.actor);
		await new ToolTrust(scenario.policy.actor, written).upsert(scenario.policy.input);
		policies.policies = written.policies;
	}
	const effects = new InMemorySuggestionEffects();
	const search = new InMemorySearchRepository(actor);
	const embeddings = new InMemoryRetrievalProvider();
	const index = createContentIndex(search, undefined, undefined, false, embeddings);
	const controller = new Memory(
		actor,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<MemoryDependencies>({
			...agentToolResultsFixture(),
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryChanges: library.changes,
			suggestionCreator: inbox.creator,
			suggestionAccepter: inbox.accepter,
			trustPolicyEvaluator: trust,
			suggestionEffects: effects,
			memoryIndexer: index,
			transactionRunner: new InMemoryTransactionRunner([entries, effects, search])
		})
	);
	const result = await controller.propose({
		scope: 'user',
		operation: 'add',
		content: 'Prefer concise replies.',
		provenanceId: testProvenanceId(),
		confidence: scenario.confidence
	});
	const stored = await records.findById(result.suggestion.id);
	expect({
		returned: result.suggestion,
		status: stored?.status,
		autoAccepted: stored?.isAutoAccepted,
		applied: result.appliedEntry,
		entries: await library.library.list({}),
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
