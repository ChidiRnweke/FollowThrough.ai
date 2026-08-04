import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import type { LocalDate } from '$lib/models/workspace';
import type { PromiseCandidate } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
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

export interface PromiseExtractor {
	extract(
		actor: ActorContext,
		selection: TextSelection,
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
	extract(text: string, signal?: AbortSignal): Promise<readonly StructuredPromiseResult[] | undefined>;
}

const PromiseExtraction = z.object({
	promises: z.array(
		z.object({
			action: z.string().min(1),
			ownerName: z.string().nullable(),
			responsibility: z.enum(['mine', 'waiting_on']),
			dueDateVerbatim: z.string().nullable(),
			resolvedDueDate: z.string().nullable(),
			strength: z.enum(['explicit', 'implied', 'tentative']),
			confidence: z.number().int().min(0).max(100)
		})
	)
});

const SYSTEM_PROMPT = `Extract only genuine commitments from architecture or meeting notes.
Separate action, owner, responsibility, due-date wording, resolved ISO date, and strength.
"mine" means the current user or their group committed; "waiting_on" means someone else committed.
Questions, suggestions, aspirations, and floated options are not promises.
Use explicit for direct commitments, implied for contextually expected actions, and tentative for hedged commitments.`;

export interface PromiseDiscoveryOptions extends LanguageModelClientOptions {
	readonly model?: string;
	readonly observer?: OperationObserver;
}

export class PromiseClassification implements StructuredPromiseClient {
	private readonly client;
	private readonly model: string;
	private readonly observer: OperationObserver;

	constructor(apiKey: string, options: PromiseDiscoveryOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createLanguageModelClient(apiKey, options);
		this.observer = options.observer ?? directObserver;
	}

	async extract(
		text: string,
		signal?: AbortSignal
	): Promise<readonly StructuredPromiseResult[] | undefined> {
		return this.observer.run(
			'promise.extract',
			{ input: text, metadata: { model: this.model } },
			async () => {
				const completion = await this.client.chat.completions.parse(
					{
						model: this.model,
						messages: [
							{ role: 'system', content: SYSTEM_PROMPT },
							{ role: 'user', content: text }
						],
						response_format: zodResponseFormat(PromiseExtraction, 'promise_extraction')
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
	private readonly fallback: PromiseExtractor;
	private readonly client?: StructuredPromiseClient;

	constructor(options: {
		client?: StructuredPromiseClient;
		fallback: PromiseExtractor;
		apiKey?: string;
		model?: string;
		observer?: OperationObserver;
	}) {
		this.fallback = options.fallback;
		const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
		this.client =
			options.client ??
			(apiKey
				? new PromiseClassification(apiKey, {
						model: options.model,
						baseURL: process.env.OPENROUTER_BASE_URL,
						appURL: process.env.ORIGIN,
						observer: options.observer
					})
				: undefined);
	}

	async extract(
		actor: ActorContext,
		selection: TextSelection,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		if (!this.client) return this.fallback.extract(actor, selection, signal);
		try {
			const promises = await this.client.extract(selection.text, signal);
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
