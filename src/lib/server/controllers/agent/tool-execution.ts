import type {
	AgentExecutionMode,
	PendingAgentDecision,
	ToolClassification
} from '$lib/models/agent';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import type { PreparedAction, ToolPreparation } from './tool-calls';
import type { AgentToolReviewControl } from './tool-reviews';

export interface AgentToolOperation {
	readonly name: ToolName;
	readonly classification: ToolClassification;
	readonly prepare: (input: AgentPayload) => PreparedAction;
}
export interface AgentToolExecutionControl {
	prepare(
		definition: AgentToolOperation,
		input: AgentPayload,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation>;
	execute(
		definition: AgentToolOperation,
		action: PreparedAction,
		callId: string | undefined,
		run: () => Promise<AgentPayload>
	): Promise<AgentPayload>;
	checkpoint(pending: PendingAgentDecision): PendingAgentDecision;
}

/** Apply review and execution policy to the same prepared action and call identity. */
export class AgentToolExecution implements AgentToolExecutionControl {
	constructor(
		private readonly mode: AgentExecutionMode,
		private readonly reviews: AgentToolReviewControl,
		private readonly executor: AgentToolExecutor
	) {}
	prepare(
		definition: AgentToolOperation,
		input: AgentPayload,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation> {
		return this.reviews.prepare(
			definition.name,
			definition.classification,
			this.mode,
			definition.prepare(input),
			callId,
			phase
		);
	}
	execute(
		definition: AgentToolOperation,
		action: PreparedAction,
		callId: string | undefined,
		run: () => Promise<AgentPayload>
	): Promise<AgentPayload> {
		return this.executor.execute(
			{
				...(callId === undefined ? {} : { callId }),
				toolName: definition.name,
				arguments: action.arguments,
				classification: definition.classification
			},
			run
		);
	}
	checkpoint(pending: PendingAgentDecision): PendingAgentDecision {
		return this.reviews.checkpoint(pending);
	}
}
