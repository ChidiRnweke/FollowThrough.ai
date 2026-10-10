import type { IndexChunking } from '$lib/models/knowledge-search';
import { createContentIndex } from '$lib/server/factories/content-index';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import type { IndexCapabilities } from '$lib/server/services/knowledge-search/indexing';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const createTestContentIndex = (
	repository: RetrievalIndexRepository,
	model: string,
	chunking: IndexChunking = { targetTokens: 2400, overlapTokens: 480 },
	defer = false
): IndexCapabilities => createContentIndex(repository, model, testTokenizer, chunking, defer);
