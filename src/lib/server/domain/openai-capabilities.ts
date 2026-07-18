import { zodResponseFormat } from 'openai/helpers/zod';
import {
	createOpenRouterClient,
	DEFAULT_GENERATION_MODEL,
	type OpenRouterClientOptions
} from './openrouter-client';
import { z } from 'zod';
import type { ActorContext, LocalDate, PromiseCandidate, TextSelection } from '$lib/models';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/models';
import type {
	PromiseExtractor,
	StructuredPromiseClient,
	StructuredPromiseResult
} from '$lib/services';
import { DeterministicPromiseExtractor } from './deterministic-promise-extractor';

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

export interface OpenAIStructuredPromiseClientOptions extends OpenRouterClientOptions {
	readonly model?: string;
}

export class OpenAIStructuredPromiseClient implements StructuredPromiseClient {
	private readonly client;
	private readonly model: string;

	constructor(apiKey: string, options: OpenAIStructuredPromiseClientOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createOpenRouterClient(apiKey, options);
	}

	async extract(text: string): Promise<readonly StructuredPromiseResult[] | undefined> {
		const completion = await this.client.chat.completions.parse({
			model: this.model,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: text }
			],
			response_format: zodResponseFormat(PromiseExtraction, 'promise_extraction')
		});
		return completion.choices[0]?.message.parsed?.promises;
	}
}

export class OpenAIPromiseExtractor implements PromiseExtractor {
	private readonly fallback: PromiseExtractor;
	private readonly client?: StructuredPromiseClient;

	constructor(
		options: {
			client?: StructuredPromiseClient;
			fallback?: PromiseExtractor;
			apiKey?: string;
			model?: string;
		} = {}
	) {
		this.fallback = options.fallback ?? new DeterministicPromiseExtractor();
		const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
		this.client =
			options.client ??
			(apiKey
				? new OpenAIStructuredPromiseClient(apiKey, {
						model: options.model,
						baseURL: process.env.OPENROUTER_BASE_URL,
						appURL: process.env.PUBLIC_APP_URL
					})
				: undefined);
	}

	async extract(
		actor: ActorContext,
		selection: TextSelection
	): Promise<readonly PromiseCandidate[]> {
		if (!this.client) return this.fallback.extract(actor, selection);
		try {
			const promises = await this.client.extract(selection.text);
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
