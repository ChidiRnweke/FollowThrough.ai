import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { IndexChunking } from '$lib/models/knowledge-search';
import type { OperationObserver } from '$lib/models/telemetry';
import { DEFAULT_SEARCH_QUERY_MODEL } from '$lib/models/knowledge-search/query-generation';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import { KnowledgeRetrieval } from '$lib/server/services/knowledge-search/retrieval';
import {
	InMemoryRetrievalProvider,
	type RetrievalProviderDouble
} from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

/** The real knowledge retrieval service over a supplied index and an in-memory provider. */
export const createTestContentIndex = (
	repository: RetrievalIndexRepository,
	model = 'fake-embedding-v1',
	chunking: IndexChunking = { targetTokens: 2400, overlapTokens: 480 },
	defer = false,
	provider: RetrievalProviderDouble = new InMemoryRetrievalProvider(),
	observer: OperationObserver = { run: (_name, _context, body) => body() }
): KnowledgeRetrieval =>
	new KnowledgeRetrieval(testActor(), {
		repository,
		provider: provider.client,
		rerank: provider.rerank,
		models: { embedding: model, query: DEFAULT_SEARCH_QUERY_MODEL },
		encoding: testTokenizer,
		chunking,
		defer,
		observer
	});
