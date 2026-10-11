import type { AgentReview, PendingAgentDecision, ToolClassification } from '$lib/models/agent';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import type { z } from 'zod';
import type { Tool } from '@openai/agents';

/** A tool call whose arguments are bound, ready to run. */
export interface PreparedAction {
	readonly arguments: AgentPayloadObject;
	readonly execute: () => Promise<AgentPayload>;
}
/** What a call becomes before it runs. A failure is the envelope itself, so it is model feedback as is. */
export type ToolPreparation =
	| { readonly kind: 'ready'; readonly action: PreparedAction }
	| { readonly kind: 'approval_required'; readonly action: PreparedAction }
	| ToolFailure;

/** A reviewed call's prepared change, and how to apply it once approved. */
export type AgentToolReviewPreparation =
	| {
			readonly kind: 'prepared';
			readonly arguments: AgentPayloadObject;
			readonly review: string;
			readonly apply: () => Promise<AgentPayload>;
	  }
	| {
			readonly kind: 'failure';
			readonly arguments: AgentPayloadObject;
			readonly review: string;
			readonly failure: ToolFailure;
	  };

/**
 * How a reviewed tool prepares its exact change before approval and applies it as approved.
 * `saved` is the review an earlier phase of the same call prepared, so approval and execution
 * agree.
 */
export interface AgentToolReview {
	readonly kind: AgentReview['kind'];
	/** Reads a review saved at a checkpoint; a review that cannot be read throws. */
	restore(saved: string): string;
	/** Parses the model's arguments; invalid arguments throw a ValidationError. */
	prepare(input: AgentPayload, saved: string | undefined): Promise<AgentToolReviewPreparation>;
}

interface AgentToolDescription {
	readonly name: ToolName;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly parameters: z.ZodObject;
}

/**
 * One capability the agent can call, behind a model-facing schema. A direct tool runs one
 * controller operation. A reviewed tool prepares a change with one operation and applies the
 * approved change with another.
 */
export type AgentTool =
	| (AgentToolDescription & {
			readonly kind: 'direct';
			/** Binds the model's arguments to the operation. Invalid arguments throw a ValidationError. */
			readonly prepare: (input: AgentPayload) => PreparedAction;
	  })
	| (AgentToolDescription & { readonly kind: 'reviewed'; readonly review: AgentToolReview });

/** Which tools one run or MCP request may call, and how. */
export interface AgentToolPlan {
	/** Callable from the start. */
	readonly initial: readonly ToolName[];
	/** Callable once `search_tools` has found them. */
	readonly discoverable: readonly ToolName[];
	readonly approvalRequired: readonly ToolName[];
}

export interface AgentToolCompletion {
	readonly callId?: string;
	readonly toolName: ToolName;
	readonly arguments: AgentPayloadObject;
	readonly classification: ToolClassification;
}

/** The harness's decisions for one run's tool set; the tool set applies them to each call. */
export interface AgentToolPolicy {
	readonly plan: AgentToolPlan;
	readonly isDiscovered: (name: ToolName) => boolean;
	readonly discover: (query: string, limit: number) => Promise<readonly ToolName[]>;
	readonly completed: (call: AgentToolCompletion, output: AgentPayload) => Promise<void>;
	/** Decisions parked at an earlier checkpoint, whose prepared reviews the run resumes with. */
	readonly parked: readonly PendingAgentDecision[];
	readonly signal: AbortSignal;
}

/** The SDK tools of one agent run, and the reviews its calls prepared for a checkpoint. */
export interface AgentToolset {
	// chisel-ignore narrowing:no-unknown-type -- Tool's context parameter belongs to the agent SDK, which owns execution of this protocol value.
	readonly tools: Tool<unknown>[];
	/** Attaches the prepared review the user approves to a parked call. */
	checkpoint(pending: PendingAgentDecision): PendingAgentDecision;
}

/** The tools one MCP request may call, and how it discovers the rest. */
export interface McpToolSession {
	readonly tools: readonly AgentTool[];
	readonly plan: AgentToolPlan;
	readonly discover: (query: string, limit: number) => Promise<readonly ToolName[]>;
	/** Whether a tool's output is a failure the client should see as an error. */
	readonly failed: (value: AgentPayload) => boolean;
}
