import type { StoredMessage } from '$lib/models/agent';
import type { OperationObserver } from '$lib/models/telemetry';
import { describe, expect, it } from 'vitest';
import { createSearchQueryGeneration } from '$lib/server/factories/retrieval-providers';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import {
	testActor,
	testConversationId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const completion = (content: string | null) => ({
	id: 'completion-1',
	object: 'chat.completion',
	created: 1,
	model: 'test-model',
	choices: [
		{
			index: 0,
			finish_reason: 'stop',
			logprobs: null,
			message: { role: 'assistant', content, refusal: null }
		}
	]
});

const generator = (payload: object, status = 200) => {
	const transport: typeof globalThis.fetch = async () => Response.json(payload, { status });
	const provider = createSearchQueryGeneration({
		apiKey: 'test-key',
		baseURL: 'https://provider.test/v1',
		appURL: 'http://localhost:5173',
		fetch: transport
	});
	let output: string | undefined;
	const run: OperationObserver['run'] = async (_name, _context, body, resultText) => {
		const result = await body();
		output = resultText?.(result);
		return result;
	};
	const history: StoredMessage[] = ['first question', 'more context'].map((text) => ({
		kind: 'readable',
		id: crypto.randomUUID() as StoredMessage['id'],
		conversationId: testConversationId(),
		role: 'user',
		content: { text },
		createdAt: testNow
	}));
	const fixture = searchControllerFixture({
		queryGenerator: provider,
		conversations: { listMessages: async () => history },
		observer: { run }
	});
	return {
		generate: async (text: string) => {
			await fixture.controller.search(testActor(), {
				query: text,
				conversationId: testConversationId()
			});
			return output;
		}
	};
};

describe('Search query generation', () => {
	it('returns the trimmed generated query', async () => {
		expect(
			await generator(completion('  deployment deadlines  ')).generate('Conversation transcript')
		).toBe('deployment deadlines');
	});
	it('fails when the provider returns only whitespace', async () => {
		await expect(
			generator(completion(' \n ')).generate('Conversation transcript')
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
	it('fails when the provider returns null content', async () => {
		await expect(
			generator(completion(null)).generate('Conversation transcript')
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
	it('fails when the provider returns no choices', async () => {
		await expect(
			generator({ ...completion('query'), choices: [] }).generate('Conversation transcript')
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
	it('fails when the provider response has no completion shape', async () => {
		await expect(generator({}).generate('Conversation transcript')).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});
	it('propagates provider rejection as an explicit search failure', async () => {
		await expect(
			generator({ error: { message: 'Model unavailable' } }, 400).generate(
				'Conversation transcript'
			)
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
});

it('keeps the empty-output failure cause under the existing controller error envelope', async () => {
	await expect(generator(completion('  ')).generate('query')).rejects.toMatchObject({
		code: 'EXTERNAL_SERVICE',
		message: 'Search query generation failed',
		details: { cause: 'Search query generation returned no usable text' }
	});
});
