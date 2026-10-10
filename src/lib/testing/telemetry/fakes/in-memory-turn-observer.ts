import type { AgentTurnContext, AgentTurnObserver } from '$lib/models/telemetry';
export class InMemoryTurnObserver implements AgentTurnObserver {
	readonly turns: AgentTurnContext[] = [];
	async *run<T>(
		params: AgentTurnContext,
		body: () => AsyncIterable<T>,
		_output: () => string
	): AsyncIterable<T> {
		this.turns.push(params);
		yield* body();
	}
}
