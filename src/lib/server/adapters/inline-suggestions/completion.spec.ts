import { describe, expect, it } from 'vitest';
import { SemanticConventions as S } from '@arizeai/openinference-semantic-conventions';
import { createInlineCompletion } from '$lib/server/factories/inline-completion';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';

const prompt = { system: 'Continue the note.', user: 'We need' };
const response = JSON.stringify({
	id: 'completion-local',
	object: 'chat.completion',
	created: 1,
	model: 'provider-model',
	choices: [
		{
			index: 0,
			message: { role: 'assistant', content: '" more replicas."', refusal: null },
			finish_reason: 'stop'
		}
	],
	usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 }
});
const client = (baseURL: string) =>
	createInlineCompletion({
		apiKey: 'local-test-key',
		baseURL,
		appURL: 'https://followthrough.example'
	});

describe('inline completion provider protocol', () => {
	it('sends the selected model, exact prompts and factory headers', async () => {
		const provider = await inlineCompletionProvider(response);
		try {
			await client(provider.baseURL).complete(
				prompt,
				new AbortController().signal,
				'selected-model'
			);
			expect(
				provider.requests.map((request) => ({ ...request, body: JSON.parse(request.body) }))
			).toEqual([
				{
					method: 'POST',
					url: '/v1/chat/completions',
					authorization: 'Bearer local-test-key',
					referer: 'https://followthrough.example',
					title: 'FollowThrough',
					contentType: 'application/json',
					body: {
						model: 'selected-model',
						max_tokens: 256,
						temperature: 0.2,
						messages: [
							{ role: 'system', content: 'Continue the note.' },
							{ role: 'user', content: 'We need' }
						]
					}
				}
			]);
		} finally {
			await provider.close();
		}
	});
	it('returns raw text and maps provider model, usage, messages and finish reason', async () => {
		const provider = await inlineCompletionProvider(response);
		try {
			expect(
				await client(provider.baseURL).complete(
					prompt,
					new AbortController().signal,
					'selected-model'
				)
			).toMatchObject({
				raw: '" more replicas."',
				attributes: {
					[S.LLM_MODEL_NAME]: 'provider-model',
					[S.LLM_TOKEN_COUNT_PROMPT]: 20,
					[S.LLM_TOKEN_COUNT_COMPLETION]: 3,
					[S.LLM_TOKEN_COUNT_TOTAL]: 23,
					[S.LLM_FINISH_REASON]: 'stop',
					'llm.input_messages.0.message.content': 'Continue the note.',
					'llm.input_messages.1.message.content': 'We need',
					'llm.output_messages.0.message.content': '" more replicas."',
					[S.LLM_INVOCATION_PARAMETERS]: JSON.stringify({
						max_tokens: 256,
						reasoning: { enabled: false },
						temperature: 0.2
					})
				}
			});
		} finally {
			await provider.close();
		}
	});
	it('preserves empty content and selected-model attribution for a missing choice', async () => {
		const provider = await inlineCompletionProvider(JSON.stringify({ model: '', choices: [] }));
		try {
			expect(
				await client(provider.baseURL).complete(
					prompt,
					new AbortController().signal,
					'selected-model'
				)
			).toMatchObject({
				raw: '',
				attributes: { [S.LLM_MODEL_NAME]: 'selected-model', [S.LLM_FINISH_REASON]: 'missing' }
			});
		} finally {
			await provider.close();
		}
	});
	it('preserves an empty refusal response', async () => {
		const provider = await inlineCompletionProvider(
			JSON.stringify({
				model: 'provider-model',
				choices: [{ message: { content: null, refusal: 'Cannot continue' }, finish_reason: 'stop' }]
			})
		);
		try {
			expect(
				(
					await client(provider.baseURL).complete(
						prompt,
						new AbortController().signal,
						'selected-model'
					)
				).raw
			).toBe('');
		} finally {
			await provider.close();
		}
	});
	it('propagates provider failures', async () => {
		const provider = await inlineCompletionProvider(
			JSON.stringify({ error: { message: 'invalid completion', type: 'invalid_request_error' } }),
			400
		);
		try {
			await expect(
				client(provider.baseURL).complete(prompt, new AbortController().signal, 'selected-model')
			).rejects.toThrow('invalid completion');
		} finally {
			await provider.close();
		}
	});
	it('does not send an already cancelled completion', async () => {
		const provider = await inlineCompletionProvider(response);
		try {
			const abort = new AbortController();
			abort.abort();
			const outcome = await client(provider.baseURL)
				.complete(prompt, abort.signal, 'selected-model')
				.then(
					() => 'completed',
					(error) => error.name
				);
			expect({ outcome, requests: provider.requests }).toEqual({ outcome: 'Error', requests: [] });
		} finally {
			await provider.close();
		}
	});
});

it('cancels an in-flight provider request', async () => {
	const deferred = Promise.withResolvers<string>();
	const provider = await inlineCompletionProvider(deferred.promise);
	try {
		const abort = new AbortController();
		const outcome = client(provider.baseURL)
			.complete(prompt, abort.signal, 'selected-model')
			.then(
				() => 'completed',
				(error) => error.message
			);
		await provider.received;
		abort.abort();
		expect(await outcome).toBe('Request was aborted.');
	} finally {
		deferred.resolve(response);
		await provider.close();
	}
});
