import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { DeterministicPromiseExtractor } from '$lib/server/services/todos/promise-rules';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import {
	InMemoryPromiseExtractor,
	InMemoryProvenanceRecorder,
	InMemoryTrustPolicyEvaluator
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const promiseSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 20,
	text: 'I will send it soon.'
};

export const promiseExtractionFixture = () => {
	const content = new InMemoryNoteContent(testActor());
	content.notes = [noteBuilder({ plainText: promiseSelection.text })];
	const extractor = new InMemoryPromiseExtractor();
	const provenance = new InMemoryProvenanceRecorder(testActor());
	const suggestions = new InMemorySuggestions(testActor());
	const effects = new InMemorySuggestionEffects();
	const trust = new InMemoryTrustPolicyEvaluator();
	const todos = new InMemoryTodos(testActor());
	const runs = new InMemoryAgentRunPersistence(testActor());
	const conversations = new InMemoryConversationRepository(testActor());
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
	const requests = new NoteActionRequests(testActor(), runs, runs, conversations);
	const dependencies = capabilityDependencies<TodosDependencies>({
		...agentToolResultsFixture(),
		boardExport: new TodoBoardExportService(),
		todoPresentation: new TodoPresentationService(),
		todoEditingRules: new TodoEditingRulesService(),
		todoCreationRules: new TodoEditingRulesService(),
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		promiseExtractor: extractor,
		promiseRules: new DeterministicPromiseExtractor(),
		promiseGeneration: { kind: 'model', model: 'test/model' },
		noteActionRequests: requests,
		runSettlements: settlements,
		runSignals: new RunSignalService(runs, runs),
		suggestionCreator: suggestions,
		trustPolicyEvaluator: trust,
		todoLibrary: todos,
		suggestionAccepter: suggestions,
		suggestionEffects: effects,
		transactionRunner: transactions
	});
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
		controller: new Todos(testActor(), new WorkspaceCommandRulesService(), dependencies)
	};
};
