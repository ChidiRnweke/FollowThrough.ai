import { zodResponseFormat } from 'openai/helpers/zod';
import {
	createOpenRouterClient,
	DEFAULT_GENERATION_MODEL,
	type OpenRouterClientOptions
} from './openrouter-client';
import { z } from 'zod';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/models';
import type {
	RelationshipClassification,
	RelationshipClassifier,
	StructuredRelationshipClient
} from '$lib/services';
import { HeuristicRelationshipClassifier } from '$lib/services';

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

export interface OpenAIStructuredRelationshipClientOptions extends OpenRouterClientOptions {
	readonly model?: string;
}

export class OpenAIStructuredRelationshipClient implements StructuredRelationshipClient {
	private readonly client;
	private readonly model: string;

	constructor(apiKey: string, options: OpenAIStructuredRelationshipClientOptions = {}) {
		this.model = options.model ?? DEFAULT_GENERATION_MODEL;
		this.client = createOpenRouterClient(apiKey, options);
	}

	async classify(
		sourceText: string,
		targetText: string
	): Promise<RelationshipClassification | undefined> {
		const completion = await this.client.chat.completions.parse({
			model: this.model,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: `SOURCE:\n${sourceText}\n\nTARGET:\n${targetText}` }
			],
			response_format: zodResponseFormat(RelationshipOutput, 'relationship_classification')
		});
		return completion.choices[0]?.message.parsed ?? undefined;
	}
}

export class OpenAIRelationshipClassifier implements RelationshipClassifier {
	private readonly client?: StructuredRelationshipClient;
	private readonly fallback: RelationshipClassifier;

	constructor(
		options: {
			client?: StructuredRelationshipClient;
			fallback?: RelationshipClassifier;
			apiKey?: string;
			model?: string;
		} = {}
	) {
		const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
		this.client =
			options.client ??
			(apiKey
				? new OpenAIStructuredRelationshipClient(apiKey, {
						model: options.model,
						baseURL: process.env.OPENROUTER_BASE_URL,
						appURL: process.env.PUBLIC_APP_URL
					})
				: undefined);
		this.fallback = options.fallback ?? new HeuristicRelationshipClassifier();
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
