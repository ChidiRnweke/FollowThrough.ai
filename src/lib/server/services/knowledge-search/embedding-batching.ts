import { InvalidGeneratedContentError } from '$lib/errors';
import {
	EMBEDDING_BATCH_TOKENS,
	type EmbeddingBatch
} from '$lib/models/knowledge-search/embeddings';
import type { TokenCounter } from '$lib/models/tokenization';

export interface IEmbeddingBatching {
	batches(contents: readonly string[]): Iterable<readonly string[]>;
	combine(model: string, batches: readonly EmbeddingBatch[]): EmbeddingBatch;
}

/** Ordered request budgets; an oversized individual input is never discarded or split. */
export class EmbeddingBatching implements IEmbeddingBatching {
	constructor(private readonly tokens: TokenCounter) {}

	combine(model: string, batches: readonly EmbeddingBatch[]): EmbeddingBatch {
		const actualModel = batches[0]?.model ?? model;
		if (batches.some((batch) => batch.model !== actualModel))
			throw new InvalidGeneratedContentError('Embedding batches returned different models');
		return { model: actualModel, vectors: batches.flatMap((batch) => batch.vectors) };
	}

	*batches(contents: readonly string[]): Iterable<readonly string[]> {
		let batch: string[] = [];
		let tokens = 0;
		for (const content of contents) {
			const count = this.tokens.count(content);
			if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) {
				yield batch;
				batch = [];
				tokens = 0;
			}
			batch.push(content);
			tokens += count;
		}
		if (batch.length) yield batch;
	}
}
