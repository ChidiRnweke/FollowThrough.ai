import type { Suggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentExecutionUpdate,
	AgentRunContext,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunImages,
	WebResearchSettings,
	InlineCompletionContext,
	InlineSuggestionRequest,
	RunAgentInput,
	ToolClassification
} from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ExtractPromisesOutput } from '$lib/models/todos';
import type { FindReferencesOutput } from '$lib/models/references';
import type { GenerateMermaidDiagramOutput } from '$lib/models/diagrams';
import type { TextSelection } from '$lib/models/notes';
import type { RelateSelectionOutput } from '$lib/models/relationships';

export interface AgentWorkflowToolbox {
	extractPromises(
		actor: ActorContext,
		selection: TextSelection
	): Promise<ExtractPromisesOutput<Suggestion>>;
	relate(actor: ActorContext, selection: TextSelection): Promise<RelateSelectionOutput<Suggestion>>;
	reference(
		actor: ActorContext,
		selection: TextSelection
	): Promise<FindReferencesOutput<Suggestion>>;
	generateDiagram(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<GenerateMermaidDiagramOutput<Suggestion>>;
}
export interface AgentRunner {
	execute(input: {
		readonly actor: ActorContext;
		readonly run: AgentRun;
		readonly request: RunAgentInput;
		readonly imageInput: AgentRunImages;
		readonly webSearch: WebResearchSettings;
		readonly context: AgentRunContext;
		/** Decisions to apply before resuming, one per parked tool call. */
		readonly decisions?: readonly AgentRunDecisionRecord[];
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate>;
}

/**
 * One toolless model call that turns assembled context into caret text.
 *
 * `model` is the caller's per-user choice; omitting it falls back to the
 * generator's own environment-derived default.
 */
export interface InlineCompletionGenerator {
	complete(
		request: InlineSuggestionRequest,
		context: InlineCompletionContext,
		signal: AbortSignal,
		model?: string
	): Promise<string>;
}

/**
 * Ghost text fires on every typing pause, so an abandoned request must never
 * queue behind another. `admit` refuses a second concurrent request for one
 * user and anything past the per-minute budget.
 */

/**
 * The seam every tool call crosses between the SDK adapter and the run.
 *
 * The action and its result are {@link AgentPayload}, not `unknown`. The factory
 * has already read each result into that type one frame below, so `unknown` here
 * claimed an uncertainty that was already resolved, and every observer of a tool
 * call had to guess the shape back.
 *
 * `callId` is optional because the provider does not always send one. It used to
 * arrive as `String(details?.toolCall?.callId ?? '')`, which spelled the absence
 * as a value. The Agent controller keys its successful mutations by this id, so
 * two calls without one collided and the second settled under the first one's
 * resource.
 *
 * `AgentExecution` declares a local copy of this port. They meet where the
 * controller hands its executor to the runner, so a
 * copy that drifts fails `pnpm check` there.
 */
export interface AgentToolExecutor {
	execute(
		input: {
			readonly callId?: string;
			readonly toolName: ToolName;
			readonly arguments: AgentPayloadObject;
			readonly classification: ToolClassification;
		},
		action: () => Promise<AgentPayload>
	): Promise<AgentPayload>;
}
