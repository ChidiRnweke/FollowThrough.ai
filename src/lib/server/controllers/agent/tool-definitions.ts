import type { RunAgentInput } from '$lib/models/agent';
import type { TextSelection } from '$lib/models/notes';
export interface AgentToolDefinitionSource<T> {
	definitions(): T[];
}
/** A selection operation exists only for a run that carries an actual selection. */
export class AgentToolDefinitions<T> implements AgentToolDefinitionSource<T> {
	constructor(
		private readonly input: RunAgentInput,
		private readonly shared: () => T[],
		private readonly app: () => T[],
		private readonly selection: (selection: TextSelection) => T[]
	) {}
	definitions(): T[] {
		return [
			...this.shared(),
			...this.app(),
			...(this.input.selection ? this.selection(this.input.selection) : [])
		];
	}
}
