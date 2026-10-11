import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';

/** Narrow an already parsed union; external values must first cross the Zod boundary. */
const isAgentPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const agentPayloadItems = (value: AgentPayload): readonly AgentPayload[] | undefined =>
	Array.isArray(value) ? value : undefined;

export interface AgentPayloadInspection {
	isAgentPayloadObject(value: AgentPayload): value is AgentPayloadObject;
	agentPayloadItems(value: AgentPayload): readonly AgentPayload[] | undefined;
}
export class AgentPayloadInspectionService implements AgentPayloadInspection {
	isAgentPayloadObject(value: AgentPayload): value is AgentPayloadObject {
		return isAgentPayloadObject(value);
	}
	agentPayloadItems(value: AgentPayload): readonly AgentPayload[] | undefined {
		return agentPayloadItems(value);
	}
}
