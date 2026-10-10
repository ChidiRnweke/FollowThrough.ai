import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_MODEL } from '$lib/models/knowledge-search/embeddings';
import { createEmbeddings } from '$lib/server/factories/retrieval-providers';

interface RecordedRequest {
	readonly model: string;
	readonly input: readonly string[];
}

class EmbeddingResponses {
	result: readonly { readonly index: number; readonly embedding: readonly number[] }[] = [];
	status = 200;
	readonly requests: RecordedRequest[] = [];
	readonly fetch: typeof globalThis.fetch = async (_url, init) => {
		const body = JSON.parse(String(init?.body));
		this.requests.push({ model: body.model, input: body.input });
		return Response.json(
			{
				data: this.result.map((item) => ({
					...item,
					embedding: Buffer.from(new Float32Array(item.embedding).buffer).toString('base64')
				}))
			},
			{ status: this.status }
		);
	};
}

const embedder = (responder: EmbeddingResponses, model?: string) =>
	createEmbeddings(
		{
			apiKey: 'test-key',
			baseURL: 'https://provider.test/v1',
			appURL: 'http://localhost:5173',
			fetch: responder.fetch,
			...(model === undefined ? {} : { model })
		},
		{ run: (_name, _context, body) => body() }
	);

describe('Embeddings', () => {
	it('rejects duplicate provider indexes instead of pairing vectors with the wrong input', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [
			{ index: 0, embedding: [1] },
			{ index: 0, embedding: [2] }
		];
		await expect(embedder(responder).embed(['a', 'b'])).rejects.toThrow(
			InvalidGeneratedContentError
		);
	});

	it('rejects indexes outside the input positions', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [{ index: 1, embedding: [1] }];
		await expect(embedder(responder).embed(['a'])).rejects.toThrow(InvalidGeneratedContentError);
	});

	it('sorts provider vectors by index regardless of arrival order', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [
			{ index: 1, embedding: [1] },
			{ index: 0, embedding: [0] },
			{ index: 2, embedding: [2] }
		];

		const batch = await embedder(responder).embed(['a', 'b', 'c']);

		expect(batch.vectors).toEqual([[0], [1], [2]]);
	});

	it('fails closed when the provider returns the wrong number of vectors', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [{ index: 0, embedding: [0] }];

		await expect(embedder(responder).embed(['a', 'b'])).rejects.toThrow(
			InvalidGeneratedContentError
		);
	});

	it('wraps a provider failure as a service error', async () => {
		const responder = new EmbeddingResponses();
		responder.status = 400;

		await expect(embedder(responder).embed(['a'])).rejects.toThrow(ExternalServiceError);
	});

	it('asks the provider for the model it was constructed with', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [{ index: 0, embedding: [7] }];

		await embedder(responder, 'custom/embedding-model').embed(['a']);

		expect(responder.requests[0].model).toBe('custom/embedding-model');
	});

	it('uses the module default model when none is given', async () => {
		const responder = new EmbeddingResponses();
		responder.result = [{ index: 0, embedding: [7] }];

		await embedder(responder).embed(['a']);

		expect(responder.requests[0].model).toBe(DEFAULT_EMBEDDING_MODEL);
	});
});
