import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/models';
import type { EmbeddingBatch, EmbeddingClient } from '$lib/services';

export class OpenAIEmbeddingClient implements EmbeddingClient {
	private readonly client: OpenAI;
	constructor(
		apiKey: string,
		readonly model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large'
	) {
		this.client = new OpenAI({ apiKey });
	}

	async embed(contents: readonly string[]): Promise<EmbeddingBatch> {
		try {
			const response = await this.client.embeddings.create({
				model: this.model,
				input: [...contents]
			});
			const vectors = [...response.data]
				.sort((a, b) => a.index - b.index)
				.map((item) => item.embedding);
			if (vectors.length !== contents.length)
				throw new InvalidGeneratedContentError('Embedding result count did not match input count');
			return { model: this.model, vectors };
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Embedding generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}

export class DeterministicEmbeddingClient implements EmbeddingClient {
	readonly model: string;

	constructor(private readonly dimensions = 3072) {
		this.model = `deterministic-sha256-${dimensions}`;
	}

	async embed(contents: readonly string[]): Promise<EmbeddingBatch> {
		return {
			model: this.model,
			vectors: contents.map((content) => {
				const digest = createHash('sha256').update(content).digest();
				return Array.from(
					{ length: this.dimensions },
					(_, index) => (digest[index % digest.length]! - 127.5) / 127.5
				);
			})
		};
	}
}
