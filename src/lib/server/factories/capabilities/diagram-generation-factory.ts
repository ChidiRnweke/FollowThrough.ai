import OpenAI from 'openai';
import { OpenAIProvider } from '@openai/agents';
import {
	DiagramGenerationService,
	type DiagramGeneration
} from '$lib/server/services/diagrams/generation';

/** Diagram generation against OpenRouter, one model provider lease per generation. */
export const createDiagramGeneration = (config: {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}): DiagramGeneration =>
	new DiagramGenerationService({
		available: Boolean(config.apiKey),
		models: () =>
			new OpenAIProvider({
				openAIClient: new OpenAI({
					apiKey: config.apiKey,
					baseURL: config.baseURL,
					defaultHeaders: { 'HTTP-Referer': config.appURL, 'X-OpenRouter-Title': 'FollowThrough' }
				}),
				useResponses: false,
				strictFeatureValidation: true
			})
	});
