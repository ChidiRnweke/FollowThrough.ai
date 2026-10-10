import { SearchQueryRules } from '$lib/server/services/knowledge-search/query-rules';
import {
	Retrieval,
	type RetrievalDependencies
} from '$lib/server/controllers/knowledge-search/controller';
import { KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryEmbeddingClient,
	InMemoryReranker,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const searchControllerFixture = (overrides: Partial<RetrievalDependencies> = {}) => {
	const repository = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const reranker = new InMemoryReranker();
	const controller = new Retrieval(
		capabilityDependencies<RetrievalDependencies>({
			...agentToolResultsFixture(),
			queryRules: new SearchQueryRules(),
			queryCache: undefined,
			observer: { run: (_name, _context, body) => body() },
			knowledgeLookup: new KnowledgeLookup(repository),
			embeddings,
			reranker,
			...overrides
		})
	);
	return { controller, repository, embeddings, reranker };
};
