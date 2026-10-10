import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentToolResultSelector } from '$lib/server/services/agent/tool-result-selection';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
export interface AgentToolResultControl {
	description(name: ToolName): string;
	select(value: AgentPayload, arguments_: AgentPayloadObject): AgentPayload;
}
export class AgentToolResults implements AgentToolResultControl {
	constructor(
		private readonly catalog: AgentToolCatalog,
		private readonly selection: AgentToolResultSelector
	) {}
	description(name: ToolName): string {
		return this.catalog.description(name);
	}
	select(value: AgentPayload, arguments_: AgentPayloadObject): AgentPayload {
		return this.selection.select(value, arguments_);
	}
}
