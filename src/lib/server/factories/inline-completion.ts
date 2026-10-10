import OpenAI from 'openai';
import type { InlineCompletionGenerator } from '$lib/models/agent';
import { InlineSuggestionCompletion } from '$lib/server/adapters/inline-suggestions/completion';

export interface InlineCompletionClientConfiguration {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}

export const createInlineCompletion = (
	configuration: InlineCompletionClientConfiguration
): InlineCompletionGenerator =>
	new InlineSuggestionCompletion(
		new OpenAI({
			apiKey: configuration.apiKey,
			baseURL: configuration.baseURL,
			defaultHeaders: {
				'HTTP-Referer': configuration.appURL,
				'X-OpenRouter-Title': 'FollowThrough'
			}
		})
	);
