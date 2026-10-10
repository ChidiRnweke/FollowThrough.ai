import { AgentPayloadInspectionService } from '$lib/services/agent/payload';
import {
	AgentPayloadOperations,
	type AgentPayloadController
} from '$lib/controllers/agent/payload';
export const agentPayloadOperations: AgentPayloadController = new AgentPayloadOperations(
	new AgentPayloadInspectionService()
);
