import { InvalidGeneratedContentError } from '$lib/errors';
import type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface EmbeddingClient {
	readonly model: string;
	embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch>;
}

export type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';

const EMBEDDING_BATCH_TOKENS = 30_000;
let sharedEncoding: Tiktoken | undefined;

export const embedInStableBatches = async (
	client: EmbeddingClient,
	contents: readonly string[]
): Promise<readonly (readonly number[])[]> => {
	const encoding = (sharedEncoding ??= getEncoding('cl100k_base'));
	const vectors: (readonly number[])[] = [];
	let batch: string[] = [];
	let tokens = 0;
	const flush = async () => {
		if (!batch.length) return;
		const result = await client.embed(batch);
		if (result.vectors.length !== batch.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		vectors.push(...result.vectors);
		batch = [];
		tokens = 0;
	};
	for (const content of contents) {
		const count = encoding.encode(content).length;
		if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) await flush();
		batch.push(content);
		tokens += count;
	}
	await flush();
	return vectors;
};
