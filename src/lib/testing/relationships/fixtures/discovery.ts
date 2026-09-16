import {
	Relationships,
	type RelationshipsDependencies
} from '$lib/server/controllers/relationships/controller';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import { RelationshipRules } from '$lib/server/services/relationships/rules';
import { SelectionRequests } from '$lib/server/services/agent/runs/selection-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient,
	InMemoryReranker
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import {
	InMemoryProvenanceRecorder,
	InMemoryStructuredRelationshipClient
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const relatedSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};

export const relatedNoteFixture = () => {
	const content = new InMemoryNoteContent();
	content.notes = [
		noteBuilder({ plainText: relatedSelection.text }),
		noteBuilder({ id: testNoteId(2), plainText: 'The team chose OAuth.' })
	];
	const suggestions = new InMemorySuggestions();
	const provenance = new InMemoryProvenanceRecorder();
	const repository = new InMemorySearchRepository();
	const client = new InMemoryStructuredRelationshipClient();
	client.result = { kind: 'prior_decision', justification: 'Earlier decision', confidence: 88 };
	const embeddings = new InMemoryEmbeddingClient();
	const reranker = new InMemoryReranker();
	const runs = new InMemoryAgentRunPersistence();
	const conversations = new InMemoryConversationRepository();
	const transactions = new InMemoryTransactionRunner([
		content,
		provenance,
		suggestions,
		runs,
		conversations
	]);
	const settlements = new RunSettlements(runs, runs);
	const requests = new SelectionRequests(runs, runs, conversations);
	const dependencies: RelationshipsDependencies = {
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		knowledgeLookup: new KnowledgeLookup(repository),
		embeddings,
		reranker,
		relationshipClassifier: new RelationshipDiscovery(client),
		relationshipRules: new RelationshipRules(),
		relationshipGeneration: { kind: 'model', model: 'test/model' },
		suggestionCreator: suggestions,
		transactionRunner: transactions,
		selectionRequests: requests,
		runSettlements: settlements,
		runEvents: { notify: () => {} }
	};
	const agent = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			events: runs,
			decisions: runs,
			settlements,
			transactionRunner: transactions,
			eventBus: { notify: () => {} }
		})
	);
	return {
		controller: new Relationships(dependencies),
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
		embeddings,
		reranker
	};
};
