import type { RunAgentInput } from '$lib/models/agent';
import type { TextSelection } from '$lib/models/notes';
export interface AgentToolDefinitionSource<T> {
	definitions(): T[];
}
/** A selection operation exists only for a run that carries an actual selection. */
export class AgentToolDefinitions<T> implements AgentToolDefinitionSource<T> {
	constructor(
		private readonly input: RunAgentInput,
		private readonly shared: AgentToolDefinitionSource<T>,
		private readonly app: AgentToolDefinitionSource<T>,
		private readonly selection: (selection: TextSelection) => AgentToolDefinitionSource<T>
	) {}
	definitions(): T[] {
		return [
			...this.shared.definitions(),
			...this.app.definitions(),
			...(this.input.selection ? this.selection(this.input.selection).definitions() : [])
		];
	}
}

export class McpToolDefinitions<T> implements AgentToolDefinitionSource<T> {
	constructor(
		private readonly shared: AgentToolDefinitionSource<T>,
		private readonly mcp: AgentToolDefinitionSource<T>
	) {}
	definitions(): T[] {
		return [...this.shared.definitions(), ...this.mcp.definitions()];
	}
}
