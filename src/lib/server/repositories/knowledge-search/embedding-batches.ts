import { InvalidGeneratedContentError } from '$lib/errors';
import { getEncoding } from 'js-tiktoken';

export interface EmbeddingClient {
	readonly model: string;
	embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch>;
}

export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}

const EMBEDDING_BATCH_TOKENS = 30_000;
const countTokens = (value: string): number => getEncoding('cl100k_base').encode(value).length;

export const embedInStableBatches = async (
	client: EmbeddingClient,
	contents: readonly string[]
): Promise<readonly (readonly number[])[]> => {
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
		const count = countTokens(content);
		if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) await flush();
		batch.push(content);
		tokens += count;
	}
	await flush();
	return vectors;
};
