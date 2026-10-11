import type { AgentExecutionMode, ToolClassification } from '$lib/models/agent';
export interface AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready';
}
export class AgentToolApprovalRules implements AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready' {
		return classification === 'mutation' && mode === 'approval_required'
			? 'approval_required'
			: 'ready';
	}
}
