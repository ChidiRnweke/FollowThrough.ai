import OpenAI from 'openai';
import { z } from 'zod';

const chatRequestSchema = z.looseObject({
	model: z.string(),
	messages: z.array(z.object({ role: z.string(), content: z.string() }))
});

/**
 * An OpenAI-compatible chat-completions endpoint served in memory over `fetch`.
 * `content` is what the model answers; the inline completion asks for a JSON edit,
 * so its default is one.
 */
export class InMemoryChatCompletions {
	content: string | null = JSON.stringify({
		replaceBefore: '',
		replaceAfter: '',
		text: ' window.'
	});
	failure?: Error;
	readonly requests: z.infer<typeof chatRequestSchema>[] = [];

	readonly fetch: typeof globalThis.fetch = async (_url, init) => {
		this.requests.push(chatRequestSchema.parse(JSON.parse(String(init?.body))));
		if (this.failure) throw this.failure;
		return Response.json({
			id: 'completion-1',
			object: 'chat.completion',
			created: 1,
			model: 'test-model',
			choices: [
				{
					index: 0,
					finish_reason: 'stop',
					logprobs: null,
					message: { role: 'assistant', content: this.content, refusal: null }
				}
			]
		});
	};

	readonly client = new OpenAI({
		apiKey: 'test-key',
		baseURL: 'https://provider.test/v1',
		fetch: this.fetch,
		maxRetries: 0
	});
}
