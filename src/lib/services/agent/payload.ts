import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';

/** Narrow an already parsed union; external values must first cross the Zod boundary. */
export const isAgentPayloadObject = (value: AgentPayload): value is AgentPayloadObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
export const agentPayloadItems = (value: AgentPayload): readonly AgentPayload[] | undefined =>
	Array.isArray(value) ? value : undefined;
