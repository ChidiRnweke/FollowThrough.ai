import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import type { ActorContext } from '$lib/models/identity';
import type { LocalDate } from '$lib/models/workspace';
import type { PromiseCandidate, PromiseModelContext } from '$lib/models/todos';
import { promiseExtractionSchema } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
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

export interface PromiseExtractor {
	extract(
		actor: ActorContext,
		selection: TextSelection,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]>;
}

export interface StructuredPromiseResult {
	readonly action: string;
	readonly ownerName: string | null;
	readonly responsibility: 'mine' | 'waiting_on';
	readonly dueDateVerbatim: string | null;
	readonly resolvedDueDate: string | null;
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

export interface PromiseDiscoveryOptions extends LanguageModelClientOptions {
	readonly observer?: OperationObserver;
}

export class PromiseClassification implements StructuredPromiseClient {
	private readonly client;
	private readonly observer: OperationObserver;

	constructor(apiKey: string | undefined, options: PromiseDiscoveryOptions = {}) {
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
				return completion.choices[0]?.message.parsed?.promises;
			},
			(result) => JSON.stringify(result)
		);
	}
}

export class PromiseDiscovery implements PromiseExtractor {
	constructor(private readonly client: StructuredPromiseClient) {}

	async extract(
		actor: ActorContext,
		selection: TextSelection,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		void actor;
		try {
			const promises = await this.client.extract(selection.text, context, signal);
			if (!promises)
				throw new InvalidGeneratedContentError('The model returned no structured promise output');
			return promises.map((promise) => ({
				action: promise.action,
				...(promise.ownerName ? { ownerName: promise.ownerName } : {}),
				responsibility: promise.responsibility,
				...(promise.dueDateVerbatim ? { dueDateVerbatim: promise.dueDateVerbatim } : {}),
				...(promise.resolvedDueDate
					? { resolvedDueDate: promise.resolvedDueDate as LocalDate }
					: {}),
				strength: promise.strength,
				confidence: promise.confidence
			}));
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Promise extraction failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
