import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import type { LocalDate } from '$lib/models/workspace';
import type { PromiseModelContext } from '$lib/models/todos';
import { promiseExtractionSchema } from '$lib/models/todos';
import { ExternalServiceError } from '$lib/errors';
import type { OperationObserver } from '$lib/models/telemetry';
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

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

export interface StructuredPromiseResult {
	readonly action: string;
	readonly ownerName: string | null;
	readonly responsibility: 'mine' | 'waiting_on';
	readonly dueDateVerbatim: string | null;
	readonly resolvedDueDate: LocalDate | null;
	readonly strength: 'explicit' | 'implied' | 'tentative';
	readonly confidence: number;
}

export interface StructuredPromiseClient {
	extract(
		text: string,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly StructuredPromiseResult[] | undefined>;
}

const SYSTEM_PROMPT = `Extract only genuine commitments from architecture or meeting notes.
Separate action, owner, responsibility, due-date wording, resolved ISO date, and strength.
"mine" means the current user or their group committed; "waiting_on" means someone else committed.
Questions, suggestions, aspirations, and floated options are not promises.
Use explicit for direct commitments, implied for contextually expected actions, and tentative for hedged commitments.`;

export interface PromiseClassificationOptions extends LanguageModelClientOptions {
	readonly observer?: OperationObserver;
}

export class PromiseClassification implements StructuredPromiseClient {
	private readonly client;
	private readonly observer: OperationObserver;

	constructor(apiKey: string | undefined, options: PromiseClassificationOptions = {}) {
		this.client = apiKey ? createLanguageModelClient(apiKey, options) : undefined;
		this.observer = options.observer ?? directObserver;
	}

	async extract(
		text: string,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly StructuredPromiseResult[] | undefined> {
		const client = this.client;
		const { model, requestedAt } = context;
		if (!client)
			throw new ExternalServiceError('Promise extraction credentials are not configured');
		return this.observer.run(
			'promise.extract',
			{ input: text, metadata: { model } },
			async () => {
				const completion = await client.chat.completions.parse(
					{
						model,
						messages: [
							{
								role: 'system',
								content: `${SYSTEM_PROMPT}\nThe request was submitted at ${requestedAt}. Resolve relative dates against that date.`
							},
							{ role: 'user', content: text }
						],
						response_format: zodResponseFormat(promiseExtractionSchema, 'promise_extraction')
					},
					signal ? { signal } : undefined
				);
				const promises = completion.choices[0]?.message.parsed?.promises;
				return promises?.map((promise) => ({
					...promise,
					// The SDK parsed this value with the ISO-date schema before it reaches this boundary.
					resolvedDueDate:
						promise.resolvedDueDate === null ? null : (promise.resolvedDueDate as LocalDate)
				}));
			},
			(result) => JSON.stringify(result)
		);
	}
}
