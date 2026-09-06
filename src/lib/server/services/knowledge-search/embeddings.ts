import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import { getEmbeddingAttributes } from '@arizeai/openinference-core';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import OpenAI from 'openai';
import type { OperationObserver } from '$lib/models/telemetry';
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

interface LanguageModelClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

/**
 * The narrow surface the batch embedder calls, so tests can inject a
 * hand-written reply without a mocking library.
 */
export interface EmbeddingClient {
	readonly embeddings: {
		create(
			body: { readonly model: string; readonly input: string[] },
			options?: { readonly signal?: AbortSignal }
		): Promise<{
			readonly data: readonly { readonly index: number; readonly embedding: readonly number[] }[];
		}>;
	};
}

const createLanguageModelClient = (
	apiKey: string,
	options: LanguageModelClientOptions = {}
): EmbeddingClient =>
	new OpenAI({
		apiKey,
		baseURL: options.baseURL ?? 'https://openrouter.ai/api/v1',
		timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000),
		defaultHeaders: {
			'HTTP-Referer': options.appURL ?? 'http://localhost:5173',
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});

export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}

export interface IEmbeddings {
	readonly model: string;
	embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch>;
}

/**
 * Embeddings run on OpenRouter. The model stays `openai/text-embedding-3-large`
 * (3072 dims) to keep the stored `search_chunks` vectors valid — only the
 * provider/base URL changes. There is deliberately no local fallback: if the
 * embedder is unavailable the caller fails rather than silently producing
 * meaningless vectors.
 */

export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-large';

export interface EmbeddingOptions extends LanguageModelClientOptions {
	readonly model?: string;
	readonly observer?: OperationObserver;
	readonly client?: EmbeddingClient;
}

export class Embeddings implements IEmbeddings {
	private readonly client: EmbeddingClient;
	readonly model: string;
	private readonly observer: OperationObserver;

	constructor(apiKey: string, options: EmbeddingOptions = {}) {
		this.model = options.model ?? DEFAULT_EMBEDDING_MODEL;
		this.client = options.client ?? createLanguageModelClient(apiKey, options);
		this.observer = options.observer ?? directObserver;
	}

	async embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
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
