import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
	relationshipClassificationSchema,
	type RelationshipClassification
} from '$lib/models/relationships';
import type { OperationObserver } from '$lib/models/telemetry';
import { ExternalServiceError } from '$lib/errors';

export interface StructuredRelationshipClient {
	classify(
		sourceText: string,
		targetText: string,
		model: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification | undefined>;
}

const prompt = `Classify the relationship between a current architecture passage and retrieved project knowledge.
Use prior_decision only when the target records a decision made before the source.
Use contradicts for materially incompatible claims or constraints.
Use elaborates when the target adds meaningful detail to the same idea.
Use mentions for a weaker topical relationship.
Give a concise, evidence-based justification and calibrated confidence.`;

export class RelationshipLanguageModel implements StructuredRelationshipClient {
	constructor(
		private readonly apiKey: string,
		private readonly options: {
			readonly baseURL: string;
			readonly appURL: string;
			readonly observer: OperationObserver;
		}
	) {}

	async classify(
		sourceText: string,
		targetText: string,
		model: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification | undefined> {
		if (!this.apiKey)
			throw new ExternalServiceError('Relationship classification requires an OpenRouter API key');
		const client = new OpenAI({
			apiKey: this.apiKey,
			baseURL: this.options.baseURL,
			defaultHeaders: { 'HTTP-Referer': this.options.appURL, 'X-OpenRouter-Title': 'FollowThrough' }
		});
		const input = `SOURCE:\n${sourceText}\n\nTARGET:\n${targetText}`;
		return this.options.observer.run(
			'relationship.classify',
			{ input, metadata: { model } },
			async () => {
				const completion = await client.chat.completions.parse(
					{
						model,
						messages: [
							{ role: 'system', content: prompt },
							{ role: 'user', content: input }
						],
						response_format: zodResponseFormat(
							relationshipClassificationSchema,
							'relationship_classification'
						)
					},
					signal ? { signal } : undefined
				);
				return completion.choices[0]?.message.parsed ?? undefined;
			},
			(result) => JSON.stringify(result)
		);
	}
}
