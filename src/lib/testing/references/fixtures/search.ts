import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { ReferenceDiscovery } from '$lib/server/services/references/discovery';
import { AgentRunSettingsService } from '$lib/services/agent/run-settings';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import {
	References,
	type ReferencesDependencies
} from '$lib/server/controllers/references/controller';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
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
	const content = new InMemoryNoteContent(testActor());
	content.notes = [noteBuilder({ plainText: referenceSelection.text })];
	const references = new InMemoryReferencePipeline();
	const provenance = new InMemoryProvenanceRecorder(testActor());
	const suggestions = new InMemorySuggestions(testActor());
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
	const dependencies: ReferencesDependencies = {
		...agentToolResultsFixture(),
		selectionOrigins: new InMemorySelectionOrigins(content, provenance),
		referenceClient: references,
		referenceCandidates: new ReferenceDiscovery(),
		researchSettings: new AgentRunSettingsService(),
		researchOverrides: {},
		referenceModel: 'test/model',
		noteActionRequests: requests,
		runSettlements: settlements,
		runSignals: new RunSignalService(runs, runs),
		suggestionCreator: suggestions,
		transactionRunner: transactions
	};
	const agent = new AgentSdkHarness(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			runs,
			cancellations: new RunCancellation(runs),
			events: runs,
			decisions: runs,
			settlements,
			transactionRunner: transactions,
			runSignals: new RunSignalService(runs, runs)
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
