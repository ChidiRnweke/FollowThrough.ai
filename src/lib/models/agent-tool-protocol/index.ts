import type { ToolClassification } from '$lib/models/agent';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
export interface PreparedAction {
	readonly arguments: AgentPayloadObject;
	readonly execute: () => Promise<AgentPayload>;
}
export type ToolPreparation =
	| { readonly kind: 'ready'; readonly action: PreparedAction }
	| { readonly kind: 'approval_required'; readonly action: PreparedAction }
	| { readonly kind: 'failure'; readonly failure: ToolFailure };
export interface ToolCallReader {
	output(value: AgentPayload): AgentPayload;
	failure<Failure>(error: Failure): ToolFailure;
}
export interface AgentToolCallControl {
	prepare(action: () => Promise<ToolPreparation>, signal: AbortSignal): Promise<ToolPreparation>;
	execute(action: PreparedAction, signal: AbortSignal): Promise<AgentPayload>;
}

export interface AgentToolInvocationControl {
	prepare(
		input: AgentPayload,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation>;
	execute(action: PreparedAction): Promise<AgentPayload>;
}

export interface AgentToolCompletionObserver {
	completed(
		input: {
			readonly callId?: string;
			readonly toolName: ToolName;
			readonly arguments: AgentPayloadObject;
			readonly classification: ToolClassification;
		},
		output: AgentPayload
	): Promise<void>;
}

export interface ToolCallPreparation {
	readonly input: string;
	readonly preparation: Promise<ToolPreparation>;
}
export interface ToolInvocationState {
	get(id: string): ToolCallPreparation | undefined;
	save(id: string, preparation: ToolCallPreparation): void;
}
