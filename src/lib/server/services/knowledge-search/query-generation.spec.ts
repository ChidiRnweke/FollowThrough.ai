import { describe, expect, it } from 'vitest';
import { SearchQueryGeneration } from './query-generation';

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
	return new SearchQueryGeneration('test-key', {
		baseURL: 'https://provider.test/v1',
		fetch: transport
	});
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
