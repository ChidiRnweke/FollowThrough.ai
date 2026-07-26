import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/models';
import { getEmbeddingAttributes } from '@arizeai/openinference-core';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type { EmbeddingBatch, EmbeddingClient } from '$lib/services';
import { createOpenRouterClient, type OpenRouterClientOptions } from './openrouter-client';
import { traceOperation } from './telemetry';

/**
 * Embeddings run on OpenRouter. The model stays `openai/text-embedding-3-large`
 * (3072 dims) to keep the stored `search_chunks` vectors valid — only the
 * provider/base URL changes. There is deliberately no local fallback: if the
 * embedder is unavailable the caller fails rather than silently producing
 * meaningless vectors.
 */

export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-large';

export interface OpenAIEmbeddingClientOptions extends OpenRouterClientOptions {
	readonly model?: string;
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
	private readonly client;
	readonly model: string;

	constructor(apiKey: string, options: OpenAIEmbeddingClientOptions = {}) {
		this.model = options.model ?? DEFAULT_EMBEDDING_MODEL;
		this.client = createOpenRouterClient(apiKey, options);
	}

	async embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
		try {
			return await traceOperation(
				'embedding.batch',
				{
					input: JSON.stringify(contents),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.EMBEDDING,
					metadata: { model: this.model, inputCount: contents.length },
					tags: ['embedding'],
					attributes: getEmbeddingAttributes({ modelName: this.model }),
					onlyWithinWorkflow: true
				},
				async () => {
					const response = await this.client.embeddings.create(
						{ model: this.model, input: [...contents] },
						{ signal }
					);
					const vectors = [...response.data]
						.sort((a, b) => a.index - b.index)
						.map((item) => item.embedding);
					if (vectors.length !== contents.length)
						throw new InvalidGeneratedContentError(
							'Embedding result count did not match input count'
						);
					return { model: this.model, vectors };
				},
				(result) => JSON.stringify({ model: result.model, vectorCount: result.vectors.length })
			);
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Embedding generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
