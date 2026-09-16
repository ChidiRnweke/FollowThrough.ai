import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { PromiseRequests } from '$lib/server/services/agent/runs/promise-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { DeterministicPromiseExtractor } from '$lib/server/services/todos/promise-rules';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import {
	InMemoryPromiseExtractor,
	InMemoryProvenanceRecorder,
	InMemoryTrustPolicyEvaluator
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const promiseSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 20,
	text: 'I will send it soon.'
};

export const promiseExtractionFixture = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder({ plainText: promiseSelection.text })];
	const extractor = new InMemoryPromiseExtractor();
	const provenance = new InMemoryProvenanceRecorder();
	const suggestions = new InMemorySuggestions();
	const effects = new InMemorySuggestionEffects();
	const trust = new InMemoryTrustPolicyEvaluator();
	const todos = new InMemoryTodos();
	const runs = new InMemoryAgentRunPersistence();
	const conversations = new InMemoryConversationRepository();
	const transactions = new InMemoryTransactionRunner([
		content,
		provenance,
		suggestions,
		effects,
		todos,
		runs,
		conversations
	]);
	const settlements = new RunSettlements(runs, runs);
	const requests = new PromiseRequests(runs, runs, conversations);
	const dependencies = capabilityDependencies<TodosDependencies>({
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		promiseExtractor: extractor,
		promiseRules: new DeterministicPromiseExtractor(),
		promiseGeneration: { kind: 'model', model: 'test/model' },
		promiseRequests: requests,
		runSettlements: settlements,
		runEvents: { notify: () => {} },
		suggestionCreator: suggestions,
		trustPolicyEvaluator: trust,
		todoCreator: todos,
		suggestionAccepter: suggestions,
		suggestionEffects: effects,
		transactionRunner: transactions
	});
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
		content,
		extractor,
		provenance,
		suggestions,
		effects,
		trust,
		todos,
		runs,
		conversations,
		requests,
		transactions,
		dependencies,
		agent,
		controller: new Todos(dependencies)
	};
};
