import type { AgentRun, PendingAgentDecision, RunAgentInput } from '$lib/models/agent';
import type { AgentToolCompletionObserver } from '$lib/models/agent-tool-protocol';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ActorContext } from '$lib/models/identity';
import type { Tool } from '@openai/agents';

export interface AgentToolRegistry {
	// audit-allow: no-unknown-type — The provider SDK owns the Tool context parameter; this interface does not inspect it.
	agentTools(alreadyPromoted?: readonly string[]): Tool<unknown>[];
	offeredToolNames(alreadyPromoted?: readonly string[]): ToolName[];
	catalog(): readonly { readonly name: string }[];
	reviewDecision(pending: PendingAgentDecision): PendingAgentDecision;
}
export interface AgentToolSessionInput {
	readonly actor: ActorContext;
	readonly request: RunAgentInput;
	readonly run: Pick<AgentRun, 'executionMode' | 'provenanceId' | 'model' | 'pendingDecisions'>;
	readonly executor: AgentToolCompletionObserver;
	readonly signal: AbortSignal;
}
export interface ToolSessionAuthority {
	isEnabled(name: string): boolean;
}
