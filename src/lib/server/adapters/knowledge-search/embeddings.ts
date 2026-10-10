import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import type { EmbeddingBatch, EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import type { OperationObserver } from '$lib/server/adapters/telemetry/tracing';
import { getEmbeddingAttributes } from '@arizeai/openinference-core';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type OpenAI from 'openai';

/** One provider request. Owning controllers apply batching before calling this adapter. */
export class Embeddings implements EmbeddingClient {
	constructor(
		private readonly client: OpenAI,
		readonly model: string,
		private readonly observer: OperationObserver
	) {}
	async embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
		if (!contents.length) return { model: this.model, vectors: [] };
		try {
			return await this.observer.run(
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
					const ordered = [...response.data].sort((a, b) => a.index - b.index);
					if (ordered.length !== contents.length)
						throw new InvalidGeneratedContentError(
							'Embedding result count did not match input count'
						);
					if (ordered.some((item, index) => item.index !== index))
						throw new InvalidGeneratedContentError(
							'Embedding result indexes did not match input positions'
						);
					const vectors = ordered.map((item) => item.embedding);
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
