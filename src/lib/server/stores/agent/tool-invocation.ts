import type { ToolCallPreparation, ToolInvocationState } from '$lib/models/agent-tool-protocol';
/** One SDK tool instance in one execution; approval and execution share its preparations. */
export class AgentToolInvocationStore implements ToolInvocationState {
	private readonly calls = new Map<string, ToolCallPreparation>();
	get(id: string): ToolCallPreparation | undefined {
		return this.calls.get(id);
	}
	save(id: string, preparation: ToolCallPreparation): void {
		this.calls.set(id, preparation);
	}
}
