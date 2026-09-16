import {
	InlineSuggestions,
	type InlineSuggestionsDependencies
} from '$lib/server/controllers/inline-suggestions/controller';
import { InlineSuggestionAdmission } from '$lib/server/services/inline-suggestions/inline-admission';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import {
	InMemoryAgentPreferencesRepository,
	InMemoryInlineCompletion
} from '$lib/testing/agent/fakes/in-memory-inline-completion';
import {
	InMemoryEmbeddingClient,
	InMemoryReranker,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const inlineSuggestionFixture = (overrides: Partial<InlineSuggestionsDependencies> = {}) => {
	const notes = new InMemoryNoteContent();
	const memory = new InMemoryMemoryEntryRepository();
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const reranker = new InMemoryReranker();
	const generator = new InMemoryInlineCompletion();
	const preferences = new AgentPreferenceCatalog(new InMemoryAgentPreferencesRepository());
	const admission = new InlineSuggestionAdmission();
	const controller = new InlineSuggestions(
		capabilityDependencies<InlineSuggestionsDependencies>({
			noteReader: notes,
			memory,
			embeddings,
			reranker,
			knowledgeLookup: new KnowledgeLookup(search),
			inlineCompletionGenerator: generator,
			inlineSuggestionThrottle: admission,
			preferences,
			observer: { run: (_name, _context, body) => body() },
			...overrides
		})
	);
	return {
		controller,
		notes,
		memory,
		search,
		embeddings,
		reranker,
		generator,
		preferences,
		admission
	};
};
