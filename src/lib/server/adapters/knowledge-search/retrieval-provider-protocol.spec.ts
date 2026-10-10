import { describe, expect, it } from 'vitest';
import { APIUserAbortError } from 'openai';
import type { OperationObserver, WorkflowTraceContext } from '$lib/models/telemetry';
import {
	createEmbeddings,
	createSearchQueryGeneration
} from '$lib/server/factories/retrieval-providers';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';

const direct: OperationObserver = { run: (_name, _context, body) => body() };
const vector = Buffer.from(new Float32Array([0.25, 0.5]).buffer).toString('base64');
const embeddingsResponse = JSON.stringify({ data: [{ index: 0, embedding: vector }] });

const configuration = (baseURL: string) => ({
	apiKey: 'synthetic-key',
	baseURL,
	appURL: 'https://app.example.test'
});

describe('retrieval provider protocol', () => {
	it('sends factory headers and the selected embedding model through the real SDK', async () => {
		const provider = await inlineCompletionProvider(embeddingsResponse);
		try {
			const result = await createEmbeddings(
				{ ...configuration(provider.baseURL), model: 'custom/embed' },
				direct
			).embed(['source']);
			expect({ result, requests: provider.requests }).toEqual({
				result: { model: 'custom/embed', vectors: [[0.25, 0.5]] },
				requests: [
					{
						method: 'POST',
						url: '/v1/embeddings',
						authorization: 'Bearer synthetic-key',
						referer: 'https://app.example.test',
						title: 'FollowThrough',
						contentType: 'application/json',
						body: JSON.stringify({
							model: 'custom/embed',
							input: ['source'],
							encoding_format: 'base64'
						})
					}
				]
			});
		} finally {
			await provider.close();
		}
	});
	it('keeps prepared messages and raw query output unchanged at the protocol boundary', async () => {
		const provider = await inlineCompletionProvider(
			JSON.stringify({ choices: [{ message: { content: '  deployment  ' } }] })
		);
		try {
			const result = await createSearchQueryGeneration({
				...configuration(provider.baseURL),
				model: 'custom/query'
			}).generate({ system: 'instructions', user: 'transcript' });
			expect({ result, requests: provider.requests }).toEqual({
				result: { raw: '  deployment  ' },
				requests: [
					{
						method: 'POST',
						url: '/v1/chat/completions',
						authorization: 'Bearer synthetic-key',
						referer: 'https://app.example.test',
						title: 'FollowThrough',
						contentType: 'application/json',
						body: JSON.stringify({
							model: 'custom/query',
							messages: [
								{ role: 'system', content: 'instructions' },
								{ role: 'user', content: 'transcript' }
							]
						})
					}
				]
			});
		} finally {
			await provider.close();
		}
	});
	it('makes no request or span for an empty embedding input', async () => {
		const provider = await inlineCompletionProvider(embeddingsResponse);
		const spans: string[] = [];
		const run: OperationObserver['run'] = async (name, _context, body) => {
			spans.push(name);
			return body();
		};
		try {
			const result = await createEmbeddings(configuration(provider.baseURL), { run }).embed([]);
			expect({ result, requests: provider.requests, spans }).toEqual({
				result: { model: 'openai/text-embedding-3-large', vectors: [] },
				requests: [],
				spans: []
			});
		} finally {
			await provider.close();
		}
	});
	it('records one embedding span with the existing input and result summary', async () => {
		const provider = await inlineCompletionProvider(embeddingsResponse);
		const spans: { name: string; context: WorkflowTraceContext; output: string | undefined }[] = [];
		const run: OperationObserver['run'] = async (name, context, body, output) => {
			const result = await body();
			spans.push({ name, context, output: output?.(result) });
			return result;
		};
		try {
			await createEmbeddings(configuration(provider.baseURL), { run }).embed(['source']);
			expect(spans).toEqual([
				{
					name: 'embedding.batch',
					context: {
						input: '["source"]',
						inputMimeType: 'application/json',
						outputMimeType: 'application/json',
						kind: 'EMBEDDING',
						metadata: { model: 'openai/text-embedding-3-large', inputCount: 1 },
						tags: ['embedding'],
						attributes: { 'embedding.model_name': 'openai/text-embedding-3-large' },
						onlyWithinWorkflow: true
					},
					output: '{"model":"openai/text-embedding-3-large","vectorCount":1}'
				}
			]);
		} finally {
			await provider.close();
		}
	});
	it('preserves SDK cancellation instead of wrapping it as a provider failure', async () => {
		const response = Promise.withResolvers<string>();
		const provider = await inlineCompletionProvider(response.promise);
		const cancellation = new AbortController();
		try {
			const pending = createEmbeddings(configuration(provider.baseURL), direct).embed(
				['source'],
				cancellation.signal
			);
			const assertion = expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
			await provider.received;
			cancellation.abort();
			await assertion;
		} finally {
			response.resolve(embeddingsResponse);
			await provider.close();
		}
	});
});
