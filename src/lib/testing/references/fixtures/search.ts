import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import {
	References,
	type ReferencesDependencies
} from '$lib/server/controllers/references/controller';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ReferenceRanking } from '$lib/server/services/references/ranking';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySelectionOrigins } from '$lib/testing/notes/fakes/in-memory-selection-origins';
import {
	InMemoryProvenanceRecorder,
	InMemoryReferencePipeline
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const referenceSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 9,
	text: 'Use OAuth'
};

export const referenceSearchFixture = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder({ plainText: referenceSelection.text })];
	const references = new InMemoryReferencePipeline();
	const provenance = new InMemoryProvenanceRecorder();
	const suggestions = new InMemorySuggestions();
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
	const requests = new NoteActionRequests(runs, runs, conversations);
	const dependencies: ReferencesDependencies = {
		...agentToolResultsFixture(),
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		referenceFinder: references,
		referenceRanker: new ReferenceRanking(),
		referenceModel: 'test/model',
		noteActionRequests: requests,
		runSettlements: settlements,
		runEvents: { notify: () => {} },
		suggestionCreator: suggestions,
		transactionRunner: transactions
	};
	const agent = new Agent(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentDependencies>({
			...agentRulesFixture(),
			runs,
			cancellations: new RunCancellation(runs),
			events: runs,
			decisions: runs,
			settlements,
			transactionRunner: transactions,
			eventBus: { notify: () => {} }
		})
	);
	return {
		content,
		references,
		provenance,
		suggestions,
		runs,
		conversations,
		requests,
		transactions,
		dependencies,
		agent,
		reference: new References(dependencies)
	};
};
