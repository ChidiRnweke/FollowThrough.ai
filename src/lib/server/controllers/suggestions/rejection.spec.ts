import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	suggestionBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';

const setup = () => {
	const records = new InMemorySuggestionRepository();
	const inbox = createSuggestionServices(
		records,
		new InMemoryNoteRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryAnchorRepository(),
		{ now: () => testNow }
	);
	const controller = new Suggestions(
		new ProvenancePresentationService(),
		capabilityDependencies<SuggestionsDependencies>({
			...agentToolResultsFixture(),
			todoCreationRules: new TodoEditingRulesService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionFinder: inbox.finder,
			suggestionRejecter: inbox.rejecter,
			transactionRunner: new InMemoryTransactionRunner([])
		})
	);
	return { records, inbox, controller };
};
it('returns and stores rejection with its decision time and no applied artifact', async () => {
	const { records, controller } = setup();
	const proposal = suggestionBuilder();
	records.suggestions = [proposal];
	const result = await controller.reject(testActor(), { suggestionId: proposal.id });
	const rejected = { ...proposal, status: 'rejected', decidedAt: testNow, updatedAt: testNow };
	expect({ result, stored: records.suggestions }).toEqual({ result: rejected, stored: [rejected] });
});
it.each(['accepted', 'rejected', 'reverted', 'expired'] as const)(
	'preserves a %s suggestion when dismissal is retried',
	async (status) => {
		const { records, controller } = setup();
		const terminal = suggestionBuilder({ status });
		records.suggestions = [terminal];
		const outcome = await controller.reject(testActor(), { suggestionId: terminal.id }).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, stored: records.suggestions }).toEqual({
			outcome: 'Suggestion is not pending',
			stored: [terminal]
		});
	}
);
it('refuses another actor without changing the proposal', async () => {
	const { records, controller } = setup();
	const proposal = suggestionBuilder();
	records.suggestions = [proposal];
	const outcome = await controller.reject(testActor(2), { suggestionId: proposal.id }).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({ outcome, stored: records.suggestions }).toEqual({
		outcome: 'Suggestion was not found',
		stored: [proposal]
	});
});
it('preserves a decision that won after the pending proposal was read', async () => {
	const { records, inbox } = setup();
	const proposal = suggestionBuilder();
	records.suggestions = [proposal];
	const accepted = await inbox.accepter.accept(
		testActor(),
		proposal,
		'00000000-0000-4000-8005-000000000001',
		false
	);
	const outcome = await inbox.rejecter.reject(testActor(), proposal).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({ outcome, stored: records.suggestions }).toEqual({
		outcome: 'Suggestion is no longer pending',
		stored: [accepted]
	});
});
