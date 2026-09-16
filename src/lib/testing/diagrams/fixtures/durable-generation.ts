import { Diagrams, type DiagramsDependencies } from '$lib/server/controllers/diagrams/controller';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';
import { diagramGenerationFixture } from './generation';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

export const diagramSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 25,
	text: 'Service A calls Service B'
};

export const durableDiagramFixture = () => {
	const state = diagramGenerationFixture();
	state.notes.notes = [noteBuilder({ plainText: diagramSelection.text })];
	const suggestions = new InMemorySuggestions();
	const transactions = new InMemoryTransactionRunner([
		state.persistence,
		state.conversations,
		state.notes,
		state.provenance,
		suggestions
	]);
	const requests = new NoteActionRequests(
		state.persistence,
		state.persistence,
		state.conversations
	);
	const settlements = new RunSettlements(state.persistence, state.persistence);
	const dependencies = capabilityDependencies<DiagramsDependencies>({
		...state,
		anchorCreator: state.notes,
		drawioXmlValidator: new DrawioXmlValidator(),
		suggestionCreator: suggestions,
		transactionRunner: transactions,
		noteActionRequests: requests,
		runSettlements: settlements,
		runEvents: { notify: () => {} }
	});
	const agent = new Agent(
		capabilityDependencies<AgentDependencies>({
			runs: state.persistence,
			events: state.persistence,
			decisions: state.persistence,
			settlements,
			transactionRunner: transactions,
			eventBus: { notify: () => {} }
		})
	);
	return {
		...state,
		suggestions,
		transactions,
		requests,
		dependencies,
		agent,
		controller: new Diagrams(dependencies)
	};
};
