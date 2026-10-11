import OpenAI from 'openai';
import type { OperationObserver } from '$lib/models/telemetry';
import {
	InlineCompletion,
	type InlineCompletionService
} from '$lib/server/services/inline-suggestions/completion';

export interface InlineCompletionClientConfiguration {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}

export const createInlineCompletion = (
	configuration: InlineCompletionClientConfiguration,
	observer: OperationObserver
): InlineCompletionService =>
	new InlineCompletion({
		provider: new OpenAI({
			apiKey: configuration.apiKey,
			baseURL: configuration.baseURL,
			defaultHeaders: {
				'HTTP-Referer': configuration.appURL,
				'X-OpenRouter-Title': 'FollowThrough'
			}
		}),
		observer
	});
