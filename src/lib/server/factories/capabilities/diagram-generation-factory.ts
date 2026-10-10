import type { DiagramProviderFactory } from '$lib/server/controllers/diagrams/controller';
import { OpenAIDiagramProviders } from '$lib/server/adapters/diagrams/generation';
export const createDiagramGeneration = (config: {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}): DiagramProviderFactory => new OpenAIDiagramProviders(config);
