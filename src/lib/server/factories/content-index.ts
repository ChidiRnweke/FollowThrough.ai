import type { TokenCodec } from '$lib/models/tokenization';
import {
	ContentIndex,
	type IndexCapabilities,
	type IndexChunking
} from '$lib/server/services/knowledge-search/indexing';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';

export const createContentIndex = (
	repository: RetrievalIndexRepository,
	model: string,
	tokenizer: TokenCodec,
	chunking: IndexChunking = { targetTokens: 2400, overlapTokens: 480 },
	defer = false
): IndexCapabilities => new ContentIndex(repository, model, tokenizer, chunking, defer);
