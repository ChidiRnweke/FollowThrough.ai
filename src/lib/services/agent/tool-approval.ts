import type { AgentExecutionMode, ToolClassification } from '$lib/models/agent';
export interface AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready';
	/**
	 * A connector tool that asks follows the same rule as a mutation: it parks
	 * for approval when the mode requires approval, and runs in auto-accept
	 * (ADR 0049).
	 */
	connectorRequirement(
		choice: 'allow' | 'ask',
		mode: AgentExecutionMode
	): 'approval_required' | 'ready';
}
export class AgentToolApprovalRules implements AgentToolApprovalPolicy {
	requirement(
		classification: ToolClassification,
		mode: AgentExecutionMode
	): 'approval_required' | 'ready' {
		return this.connectorRequirement(classification === 'mutation' ? 'ask' : 'allow', mode);
	}

	connectorRequirement(
		choice: 'allow' | 'ask',
		mode: AgentExecutionMode
	): 'approval_required' | 'ready' {
		return choice === 'ask' && mode === 'approval_required' ? 'approval_required' : 'ready';
	}
}
