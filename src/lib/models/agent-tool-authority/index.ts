import type { ToolClassification } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
export interface ClassifiedTool {
	readonly name: ToolName;
	readonly classification: ToolClassification;
}
export interface ToolDiscoveryPlan {
	readonly session: number;
	readonly permitted: readonly ToolName[];
	readonly initial: readonly ToolName[];
	readonly discoverable: readonly ToolName[];
	readonly catalog: readonly ToolDescriptor[];
}
