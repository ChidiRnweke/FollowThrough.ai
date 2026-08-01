import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import { z } from 'zod';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import type { RelationshipKind } from '$lib/models/relationships';
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

export interface RelationshipClassification {
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}

export interface IRelationshipDiscovery {
	classify(sourceText: string, targetText: string): Promise<RelationshipClassification>;
}

interface RelationshipLanguageModelPort {
	classify(sourceText: string, targetText: string): Promise<RelationshipClassification | undefined>;
}

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

const RelationshipOutput = z.object({
	kind: z.enum(['prior_decision', 'contradicts', 'elaborates', 'mentions']),
	justification: z.string().min(1),
	confidence: z.number().int().min(0).max(100)
});

const SYSTEM_PROMPT = `Classify the relationship between a current architecture passage and retrieved project knowledge.
Use prior_decision only when the target records a decision made before the source.
Use contradicts for materially incompatible claims or constraints.
Use elaborates when the target adds meaningful detail to the same idea.
Use mentions for a weaker topical relationship.
Give a concise, evidence-based justification and calibrated confidence.`;

export interface RelationshipDiscoveryOptions extends LanguageModelClientOptions {
	readonly model?: string;
	readonly observer?: OperationObserver;
}

export class RelationshipLanguageModel implements RelationshipLanguageModelPort {
	private readonly client;
	private readonly model: string;
	private readonly observer: OperationObserver;

	constructor(apiKey: string, options: RelationshipDiscoveryOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createLanguageModelClient(apiKey, options);
		this.observer = options.observer ?? directObserver;
	}

	async classify(
		sourceText: string,
		targetText: string
	): Promise<RelationshipClassification | undefined> {
		const input = `SOURCE:\n${sourceText}\n\nTARGET:\n${targetText}`;
		return this.observer.run(
			'relationship.classify',
			{ input, metadata: { model: this.model } },
			async () => {
				const completion = await this.client.chat.completions.parse({
					model: this.model,
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{ role: 'user', content: input }
					],
					response_format: zodResponseFormat(RelationshipOutput, 'relationship_classification')
				});
				return completion.choices[0]?.message.parsed ?? undefined;
			},
			(result) => JSON.stringify(result)
		);
	}
}

class RelationshipRules implements IRelationshipDiscovery {
	async classify(sourceText: string, targetText: string): Promise<RelationshipClassification> {
		const sourceNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(sourceText);
		const targetNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(targetText);
		if (sourceNegates !== targetNegates)
			return {
				kind: 'contradicts',
				justification: 'The two passages express opposing constraints or recommendations.',
				confidence: 70
			};
		if (/\b(?:decided|decision|selected|chose|approved)\b/i.test(targetText))
			return {
				kind: 'prior_decision',
				justification:
					'The related passage records an earlier decision relevant to this selection.',
				confidence: 70
			};
		return {
			kind: 'mentions',
			justification: `Semantically related content: ${targetText.slice(0, 180)}`,
			confidence: 60
		};
	}
}

export class RelationshipDiscovery implements IRelationshipDiscovery {
	private readonly client?: RelationshipLanguageModelPort;
	private readonly fallback: IRelationshipDiscovery;

	constructor(
		options: {
			client?: RelationshipLanguageModelPort;
			fallback?: IRelationshipDiscovery;
			apiKey?: string;
			model?: string;
			observer?: OperationObserver;
		} = {}
	) {
		const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
		this.client =
			options.client ??
			(apiKey
				? new RelationshipLanguageModel(apiKey, {
						model: options.model,
						baseURL: process.env.OPENROUTER_BASE_URL,
						appURL: process.env.ORIGIN,
						observer: options.observer
					})
				: undefined);
		this.fallback = options.fallback ?? new RelationshipRules();
	}

	async classify(sourceText: string, targetText: string): Promise<RelationshipClassification> {
		if (!this.client) return this.fallback.classify(sourceText, targetText);
		try {
			const result = await this.client.classify(sourceText, targetText);
			if (!result)
				throw new InvalidGeneratedContentError(
					'The model returned no structured relationship output'
				);
			return result;
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Relationship classification failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
