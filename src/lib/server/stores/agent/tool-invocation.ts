import type { ToolPreparation } from '$lib/server/controllers/agent/tool-calls';
interface ToolCallPreparation {
	readonly input: string;
	readonly preparation: Promise<ToolPreparation>;
}
/** One SDK tool instance in one execution; approval and execution share its preparations. */
export class AgentToolInvocationStore {
	private readonly calls = new Map<string, ToolCallPreparation>();
	get(id: string): ToolCallPreparation | undefined {
		return this.calls.get(id);
	}
	save(id: string, preparation: ToolCallPreparation): void {
		this.calls.set(id, preparation);
	}
}
