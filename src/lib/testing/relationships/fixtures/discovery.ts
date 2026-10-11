import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import {
	Relationships,
	type RelationshipsDependencies
} from '$lib/server/controllers/relationships/controller';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import { RelationshipRules } from '$lib/server/services/relationships/rules';
import { RelationshipCandidatesService } from '$lib/services/relationships/candidates';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import {
	InMemoryProvenanceRecorder,
	InMemoryStructuredRelationshipClient
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const relatedSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};

export const relatedNoteFixture = () => {
	const content = new InMemoryNoteContent(testActor());
	content.notes = [
		noteBuilder({ plainText: relatedSelection.text }),
		noteBuilder({ id: testNoteId(2), plainText: 'The team chose OAuth.' })
	];
	const suggestions = new InMemorySuggestions(testActor());
	const provenance = new InMemoryProvenanceRecorder(testActor());
	const repository = new InMemorySearchRepository(testActor());
	const client = new InMemoryStructuredRelationshipClient();
	client.result = { kind: 'prior_decision', justification: 'Earlier decision', confidence: 88 };
	const provider = new InMemoryRetrievalProvider();
	const runs = new InMemoryAgentRunPersistence(testActor());
	const conversations = new InMemoryConversationRepository(testActor());
	const transactions = new InMemoryTransactionRunner([
		content,
		provenance,
		suggestions,
		runs,
		conversations
	]);
	const settlements = new RunSettlements(runs, runs);
	const requests = new NoteActionRequests(testActor(), runs, runs, conversations);
	const dependencies: RelationshipsDependencies = {
		...agentToolResultsFixture(),
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		knowledge: createTestContentIndex(repository, undefined, undefined, false, provider),
		relationshipClassifier: new RelationshipDiscovery(client),
		relationshipRules: new RelationshipRules(),
		relationshipGeneration: { kind: 'model', model: 'test/model' },
		suggestionCreator: suggestions,
		transactionRunner: transactions,
		noteActionRequests: requests,
		runSettlements: settlements,
		runSignals: new RunSignalService(runs, runs)
	};
	const agent = new AgentSdkHarness(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			records: new AgentRunHarnessRecords(runs, runs, runs, new InMemoryAgentSessionRepository()),
			transitions: new RunTransitions(runs),
			settlements,
			transactionRunner: transactions,
			runSignals: new RunSignalService(runs, runs)
		})
	);
	return {
		controller: new Relationships(new RelationshipCandidatesService(), dependencies),
		dependencies,
		repository,
		client,
		suggestions,
		content,
		runs,
		conversations,
		requests,
		transactions,
		agent,
		provider
	};
};
