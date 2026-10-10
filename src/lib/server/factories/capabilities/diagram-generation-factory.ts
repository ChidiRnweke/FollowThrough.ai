import {
	DiagramGeneration,
	DiagramSessions,
	type DiagramGenerator
} from '$lib/server/controllers/diagrams/generation';
import { OpenAIDiagramProviders } from '$lib/server/adapters/diagrams/generation';
import { DiagramGenerationStore } from '$lib/server/stores/diagrams/generation';
export const createDiagramGeneration = (config: {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}): DiagramGenerator =>
	new DiagramGeneration(new OpenAIDiagramProviders(config), {
		create: (provider) => new DiagramSessions(provider, new DiagramGenerationStore())
	});
