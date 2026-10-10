import type { ToolResultReader } from '$lib/models/agent-tool-context';
import { ToolResultBoundary } from '$lib/server/adapters/agent/read-tool';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import { AgentToolPresentationService } from '$lib/server/services/agent/runs/tool-views';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import { AgentPayloadInspectionService } from '$lib/services/agent/payload';
import {
	AgentToolApprovalRules,
	type AgentToolApprovalPolicy
} from '$lib/services/agent/tool-approval';
import type { AgentProjectChoiceRules } from '$lib/services/projects/agent-choice';
import { AgentProjectChoiceService } from '$lib/services/projects/agent-choice';
export interface AgentToolResultCapabilities {
	readonly toolApproval: AgentToolApprovalPolicy;
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolProjectChoice: AgentProjectChoiceRules;
	readonly toolResults: ToolResultReader;
}
export const createAgentToolResults = (): AgentToolResultCapabilities => ({
	toolApproval: new AgentToolApprovalRules(),
	toolPresentation: new AgentToolPresentationService(),
	toolPayloads: new AgentPayloadInspectionService(),
	toolProjectChoice: new AgentProjectChoiceService(),
	toolResults: new ToolResultBoundary()
});
