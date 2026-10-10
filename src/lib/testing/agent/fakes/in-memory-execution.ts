import { AgentProviderFailure } from '$lib/errors';
import type { ProviderStreamEvent } from '$lib/models/agent';
import type {
	AgentExecutionInfrastructure,
	AgentProviderTurn
} from '$lib/server/controllers/agent/execution';
import { InMemoryModelProvider, InMemoryTextModel } from './in-memory-model-provider';

export class InMemoryExecutionInfrastructure implements AgentExecutionInfrastructure {
	readonly queuedEvents: Array<readonly ProviderStreamEvent[]> = [];
	readonly providers: InMemoryModelProvider[] = [];
	constructor(readonly events: readonly ProviderStreamEvent[]) {}
	create(): InMemoryModelProvider {
		const provider = new InMemoryModelProvider(new InMemoryTextModel(''));
		this.providers.push(provider);
		return provider;
	}
	async calledTools(): Promise<readonly string[]> {
		return [];
	}
	async describeImages(): Promise<string[]> {
		return [];
	}
	async turn(): Promise<AgentProviderTurn> {
		const events = this.queuedEvents.shift() ?? this.events;
		return {
			events: (async function* () {
				yield* events;
			})(),
			outcome: async () => ({ kind: 'completed' })
		};
	}
	failure(error: unknown): AgentProviderFailure {
		if (error instanceof AgentProviderFailure) return error;
		throw error;
	}
}
