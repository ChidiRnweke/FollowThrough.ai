import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';

import type { AgentPayloadInspection } from '$lib/services/agent/payload';

export interface AgentPayloadController {
	isAgentPayloadObject(value: AgentPayload): value is AgentPayloadObject;
	agentPayloadItems(value: AgentPayload): readonly AgentPayload[] | undefined;
}
export class AgentPayloadOperations implements AgentPayloadController {
	constructor(private readonly agentPayloadInspection: AgentPayloadInspection) {}
	readonly isAgentPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
		this.agentPayloadInspection.isAgentPayloadObject(value);
	readonly agentPayloadItems = (value: AgentPayload): readonly AgentPayload[] | undefined =>
		this.agentPayloadInspection.agentPayloadItems(value);
}
