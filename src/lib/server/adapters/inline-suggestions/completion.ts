import type OpenAI from 'openai';
import { getLLMAttributes } from '@arizeai/openinference-core';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import type { Attributes } from '@opentelemetry/api';
import type {
	InlineCompletionGenerator,
	InlineCompletionPrompt,
	InlineCompletionResult
} from '$lib/models/agent';

// Provider overhead needs headroom; the rules service owns the visible output limit.
const MAX_COMPLETION_TOKENS = 256;

interface InlineCompletionTraceResult {
	readonly raw: string;
	readonly model: string;
	readonly finishReason: string;
	readonly usage?: {
		readonly prompt_tokens?: number;
		readonly completion_tokens?: number;
		readonly total_tokens?: number;
	};
}

const inlineCompletionTraceAttributes = (
	prompt: InlineCompletionPrompt,
	result: InlineCompletionTraceResult
): Attributes => ({
	...getLLMAttributes({
		provider: 'openrouter',
		system: 'openai',
		modelName: result.model,
		invocationParameters: {
			max_tokens: MAX_COMPLETION_TOKENS,
			reasoning: { enabled: false },
			temperature: 0.2
		},
		inputMessages: [
			{ role: 'system', content: prompt.system },
			{ role: 'user', content: prompt.user }
		],
		outputMessages: [{ role: 'assistant', content: result.raw }],
		...(result.usage
			? {
					tokenCount: {
						prompt: result.usage.prompt_tokens,
						completion: result.usage.completion_tokens,
						total: result.usage.total_tokens
					}
				}
			: {})
	}),
	[SemanticConventions.LLM_FINISH_REASON]: result.finishReason
});

/** Provider protocol only; the owning controller prepares and sanitizes the completion. */
export class InlineSuggestionCompletion implements InlineCompletionGenerator {
	constructor(private readonly client: OpenAI) {}

	async complete(
		prompt: InlineCompletionPrompt,
		signal: AbortSignal,
		model: string
	): Promise<InlineCompletionResult> {
		const completion = await this.client.chat.completions.create(
			{
				model,
				max_tokens: MAX_COMPLETION_TOKENS,
				temperature: 0.2,
				messages: [
					{ role: 'system', content: prompt.system },
					{ role: 'user', content: prompt.user }
				]
			},
			{ signal }
		);
		const choice = completion.choices[0];
		const raw = choice?.message.content ?? '';
		return {
			raw,
			attributes: inlineCompletionTraceAttributes(prompt, {
				raw,
				model: completion.model || model,
				finishReason: choice?.finish_reason ?? 'missing',
				usage: completion.usage
			})
		};
	}
}
