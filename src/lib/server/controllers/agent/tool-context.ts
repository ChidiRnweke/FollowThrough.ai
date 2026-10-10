import type { RunAgentInput } from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
export interface AgentToolContext {
	readonly provenanceId: ProvenanceId;
	readonly model: string;
	readonly input: RunAgentInput;
}
export interface McpToolContext {
	readonly provenanceId: ProvenanceId;
}
export interface ToolAccessPolicy {
	isEnabled(toolName: string): boolean;
}
