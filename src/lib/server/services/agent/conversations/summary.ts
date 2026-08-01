import { ExternalServiceError } from '$lib/errors';
import OpenAI from 'openai';
interface OperationObserver {
	run<T>(
		name: string,
		context: unknown,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T>;
}
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

const DEFAULT_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';

interface LanguageModelClientOptions {
	readonly baseURL?: string;
	readonly appURL?: string;
}

const createLanguageModelClient = (
	apiKey: string,
	options: LanguageModelClientOptions = {}
): OpenAI =>
	new OpenAI({
		apiKey,
		baseURL: options.baseURL ?? 'https://openrouter.ai/api/v1',
		defaultHeaders: {
			'HTTP-Referer': options.appURL ?? 'http://localhost:5173',
			'X-OpenRouter-Title': 'FollowThrough'
		}
	});

export interface IConversationSummary {
	condense(text: string): Promise<string>;
}

/**
 * Condenses a conversation transcript into a single focused retrieval statement
 * via OpenRouter (deepseek). Used so multi-turn searches embed the whole
 * conversation's intent rather than just the latest message.
 */

const CONDENSE_PROMPT =
	'Rewrite the following conversation into a single, focused search-query statement that captures ' +
	'what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.';

export interface ConversationCondenserOptions extends LanguageModelClientOptions {
	readonly model?: string;
	readonly observer?: OperationObserver;
}

export class ConversationSummary implements IConversationSummary {
	private readonly client;
	private readonly model: string;
	private readonly observer: OperationObserver;

	constructor(apiKey: string, options: ConversationCondenserOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createLanguageModelClient(apiKey, options);
		this.observer = options.observer ?? directObserver;
	}

	async condense(text: string): Promise<string> {
		try {
			return await this.observer.run(
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
