import type {
	AgentReview,
	PendingAgentDecision,
	RunToolName,
	ToolClassification,
	ToolSubject
} from '$lib/models/agent';
import type { ConnectorTool, ConnectorToolName } from '$lib/models/connectors';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolFailure } from '$lib/models/agent/tool-failure';
import type { z } from 'zod';
import type { Tool } from '@openai/agents';

/** A tool call whose arguments are bound, ready to run. */
export interface PreparedAction {
	readonly arguments: AgentPayloadObject;
	/** `signal` is the run's: work that leaves the process must stop when the run does. */
	readonly execute: (signal: AbortSignal) => Promise<AgentPayload>;
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

/**
 * A tool on one of the user's connectors, built from its stored snapshot
 * (ADR 0049). Its schema is the server's own JSON Schema, published as written,
 * so it is not an {@link AgentTool}: those are FollowThrough's operations and
 * are offered to other MCP hosts, which connector tools never are.
 */
export interface ConnectorAgentTool {
	readonly name: ConnectorToolName;
	readonly description: string;
	readonly checksum: string;
	readonly inputSchema: AgentPayloadObject;
	/** Whether a call parks for approval in this run, decided by the harness. */
	readonly approval: 'approval_required' | 'ready';
	/** Checks the model's arguments against the schema; invalid arguments throw a ValidationError. */
	readonly prepare: (input: AgentPayload, callId: string | undefined) => PreparedAction;
}

/**
 * What the harness asks the tool factory to build for one run. A parked call
 * whose tool changed, disappeared or was turned off still needs a tool of its
 * name, or the saved run cannot resume; it gets a withdrawn one that runs
 * nothing and says why.
 */
export type ConnectorToolBuild =
	| {
			readonly kind: 'available';
			readonly tool: ConnectorTool;
			readonly connectorTitle: string;
			readonly inputSchema: AgentPayloadObject;
			readonly approval: 'approval_required' | 'ready';
	  }
	| {
			readonly kind: 'withdrawn';
			readonly name: ConnectorToolName;
			readonly checksum: string;
			readonly reason: string;
	  };

/** A call the provider parked for approval, before the run's tool set names it. */
export interface ParkedCall {
	readonly callId: string;
	readonly name: string;
	readonly arguments: AgentPayloadObject;
}

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
	readonly isDiscovered: (name: RunToolName) => boolean;
	readonly discover: (query: string, limit: number) => Promise<readonly RunToolName[]>;
	readonly completed: (call: AgentToolCompletion, output: AgentPayload) => Promise<void>;
	/** Decisions parked at an earlier checkpoint, whose prepared reviews the run resumes with. */
	readonly parked: readonly PendingAgentDecision[];
	/**
	 * Moves a connector tool's large output into an agent file and answers with
	 * what the model reads instead (ADR 0035): third-party output has no size of
	 * its own to trust.
	 */
	readonly spill: (callId: string | undefined, output: AgentPayload) => Promise<AgentPayload>;
	readonly signal: AbortSignal;
}

/** The SDK tools of one agent run, and the reviews its calls prepared for a checkpoint. */
export interface AgentToolset {
	// chisel-ignore narrowing:no-unknown-type -- Tool's context parameter belongs to the agent SDK, which owns execution of this protocol value.
	readonly tools: Tool<unknown>[];
	/**
	 * The decision a parked call becomes: a catalog call with the review the user
	 * approves, or a connector call bound to its tool's checksum. Throws for a
	 * name this run does not offer.
	 */
	checkpoint(parked: ParkedCall): PendingAgentDecision;
	/** The tool a provider event names, or absent for a name this run cannot have called. */
	subject(name: string): ToolSubject | undefined;
}

/** The tools one MCP request may call, and how it discovers the rest. */
export interface McpToolSession {
	readonly tools: readonly AgentTool[];
	readonly plan: AgentToolPlan;
	readonly discover: (query: string, limit: number) => Promise<readonly ToolName[]>;
	/** Whether a tool's output is a failure the client should see as an error. */
	readonly failed: (value: AgentPayload) => boolean;
}
