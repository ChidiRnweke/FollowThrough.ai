import { createWorkspaceViews } from '$lib/factories/workspace/views';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { memorySuggestionContext } from '$lib/testing/suggestions/fixtures/views';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memorySuggestionBuilder,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';

it('returns the same memory review view from server and downloaded records', async () => {
	const suggestion = memorySuggestionBuilder();
	const context = memorySuggestionContext(suggestion);
	const reader = new InMemorySuggestionReader();
	reader.suggestions = [suggestion];
	reader.contexts = [context];
	const controller = new Suggestions(
		new ProvenancePresentationService(),
		capabilityDependencies<SuggestionsDependencies>({
			...agentToolResultsFixture(),
			todoCreationRules: new TodoEditingRulesService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionLister: reader,
			suggestionExpirer: reader,
			suggestionContextReader: reader
		})
	);
	const records = [
		{ type: 'suggestions', value: resourceDataSchemas.suggestions.parse(suggestion) },
		{ type: 'provenance', value: resourceDataSchemas.provenance.parse(context.provenance) }
	] satisfies WorkspaceRecord[];
	const downloaded = createWorkspaceViews(
		new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
	);
	expect(downloaded.memorySuggestions()).toEqual(
		(await controller.listPendingMemory(testActor(), {})).suggestions
	);
});
