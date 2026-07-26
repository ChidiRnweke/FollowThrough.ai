import { ExternalServiceError } from '$lib/models';
import type { Condenser } from '$lib/services';
import {
	createOpenRouterClient,
	DEFAULT_GENERATION_MODEL,
	type OpenRouterClientOptions
} from './openrouter-client';
import { traceOperation } from './telemetry';

/**
 * Condenses a conversation transcript into a single focused retrieval statement
 * via OpenRouter (deepseek). Used so multi-turn searches embed the whole
 * conversation's intent rather than just the latest message.
 */

const CONDENSE_PROMPT =
	'Rewrite the following conversation into a single, focused search-query statement that captures ' +
	'what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.';

export interface ConversationCondenserOptions extends OpenRouterClientOptions {
	readonly model?: string;
}

export class ConversationCondenser implements Condenser {
	private readonly client;
	private readonly model: string;

	constructor(apiKey: string, options: ConversationCondenserOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createOpenRouterClient(apiKey, options);
	}

	async condense(text: string): Promise<string> {
		try {
			return await traceOperation(
				'conversation.condense',
				{ input: text, metadata: { model: this.model } },
				async () => {
					const completion = await this.client.chat.completions.create({
						model: this.model,
						messages: [
							{ role: 'system', content: CONDENSE_PROMPT },
							{ role: 'user', content: text }
						]
					});
					return completion.choices[0]?.message.content?.trim() || text;
				},
				(result) => result
			);
		} catch (error) {
			throw new ExternalServiceError('Conversation condensation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
