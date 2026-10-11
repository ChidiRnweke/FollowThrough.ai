import type { AgentPayload } from '$lib/models/agent/payload';
import type { ToolResultFields } from '$lib/models/tool-display';
import { readToolResultFields } from '$lib/client/agent/tool-display';
import { agentPayloadOperations } from '$lib/factories/agent/payload';
export type { ToolResultFields } from '$lib/models/tool-display';
export const toolResultFields = (output: AgentPayload | undefined): ToolResultFields =>
	readToolResultFields(agentPayloadOperations, output);
