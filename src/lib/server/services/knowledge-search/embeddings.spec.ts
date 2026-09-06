import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_MODEL, Embeddings, type EmbeddingClient } from './embeddings';

interface RecordedRequest {
	readonly model: string;
	readonly input: readonly string[];
}

class FakeEmbeddingResponder implements EmbeddingClient {
	next: {
		result?: readonly { readonly index: number; readonly embedding: readonly number[] }[];
		error?: unknown;
	} = {};
	readonly requests: RecordedRequest[] = [];

	readonly embeddings = {
		create: async (
			body: { readonly model: string; readonly input: readonly string[] },
			_options?: { readonly signal?: AbortSignal }
		): Promise<{
			readonly data: readonly { readonly index: number; readonly embedding: readonly number[] }[];
		}> => {
			this.requests.push({ model: body.model, input: body.input });
			if (this.next.error !== undefined) throw this.next.error;
			return { data: this.next.result ?? [] };
		}
	};
}

const embedder = (responder: FakeEmbeddingResponder, model?: string): Embeddings =>
	new Embeddings('test-key', { client: responder, ...(model === undefined ? {} : { model }) });

describe('Embeddings', () => {
	it('sorts provider vectors by index regardless of arrival order', async () => {
		const responder = new FakeEmbeddingResponder();
		responder.next.result = [
			{ index: 1, embedding: [1] },
			{ index: 0, embedding: [0] },
			{ index: 2, embedding: [2] }
		];

		const batch = await embedder(responder).embed(['a', 'b', 'c']);

		expect(batch.vectors).toEqual([[0], [1], [2]]);
	});

	it('fails closed when the provider returns the wrong number of vectors', async () => {
		const responder = new FakeEmbeddingResponder();
		responder.next.result = [{ index: 0, embedding: [0] }];

		await expect(embedder(responder).embed(['a', 'b'])).rejects.toThrow(
			InvalidGeneratedContentError
		);
	});

	it('rethrows the in-flight error when the request was aborted', async () => {
		const controller = new AbortController();
		const responder = new FakeEmbeddingResponder();
		const marker = new Error('cancelled mid-flight');
		responder.next.error = marker;
		controller.abort();

		await expect(embedder(responder).embed(['a'], controller.signal)).rejects.toBe(marker);
	});

	it('wraps a provider failure as a service error', async () => {
		const responder = new FakeEmbeddingResponder();
		responder.next.error = new Error('provider exploded');

		await expect(embedder(responder).embed(['a'])).rejects.toThrow(ExternalServiceError);
	});

	it('asks the provider for the model it was constructed with', async () => {
		const responder = new FakeEmbeddingResponder();
		responder.next.result = [{ index: 0, embedding: [7] }];

		await embedder(responder, 'custom/embedding-model').embed(['a']);

		expect(responder.requests[0].model).toBe('custom/embedding-model');
	});

	it('uses the module default model when none is given', async () => {
		const responder = new FakeEmbeddingResponder();
		responder.next.result = [{ index: 0, embedding: [7] }];

		await embedder(responder).embed(['a']);

		expect(responder.requests[0].model).toBe(DEFAULT_EMBEDDING_MODEL);
	});
});
