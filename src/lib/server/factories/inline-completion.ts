import OpenAI from 'openai';
import type { OperationObserver } from '$lib/models/telemetry';
import { withReasoning } from '$lib/server/infrastructure/openrouter/reasoning';
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
			// Ghost text has a 256-token budget for text alone. A model that reasons
			// by default (the configured `deepseek/deepseek-v4-flash` does) spends all
			// of it thinking and returns no content, so the switch is off here.
			fetch: withReasoning(globalThis.fetch, { enabled: false }),
			defaultHeaders: {
				'HTTP-Referer': configuration.appURL,
				'X-OpenRouter-Title': 'FollowThrough'
			}
		}),
		observer
	});
