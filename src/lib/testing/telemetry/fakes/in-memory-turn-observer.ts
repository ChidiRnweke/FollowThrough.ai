import type { AgentTurnContext } from '$lib/models/telemetry';
import type { AgentTurnObserver } from '$lib/server/controllers/agent/execution';
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
