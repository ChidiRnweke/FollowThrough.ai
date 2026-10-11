import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { InlineContextService } from '$lib/server/services/inline-suggestions/inline-context';
import {
	InlineSuggestions,
	type InlineSuggestionsDependencies
} from '$lib/server/controllers/inline-suggestions/controller';
import { InlineAdmissionService } from '$lib/server/services/inline-suggestions/inline-admission';
import { InMemoryInlineAttempts } from '$lib/testing/inline-suggestions/fakes/inline-attempts';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import {
	InMemoryAgentPreferencesRepository,
	InMemoryInlineCompletion
} from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const inlineSuggestionFixture = (overrides: Partial<InlineSuggestionsDependencies> = {}) => {
	const notes = new InMemoryNoteContent(testActor());
	const memory = new InMemoryMemoryEntryRepository(testActor());
	const search = new InMemorySearchRepository(testActor());
	const provider = new InMemoryRetrievalProvider();
	const generator = new InMemoryInlineCompletion();
	const preferences = new AgentPreferenceCatalog(
		testActor(),
		new InMemoryAgentPreferencesRepository(testActor())
	);
	const attempts = new InMemoryInlineAttempts();
	const controller = new InlineSuggestions(
		testActor(),
		capabilityDependencies<InlineSuggestionsDependencies>({
			context: new InlineContextService(testTokenizer),
			noteReader: notes,
			memory,
			knowledge: createTestContentIndex(search, undefined, undefined, false, provider),
			completion: generator,
			defaultCompletionModel: 'default-inline-model',
			admission: new InlineAdmissionService(attempts),
			now: () => 0,
			preferences,
			observer: { run: (_name, _context, body) => body() },
			workflow: { run: (_name, _context, body) => body() },
			...overrides
		})
	);
	return {
		controller,
		notes,
		memory,
		search,
		provider,
		generator,
		preferences,
		attempts
	};
};
