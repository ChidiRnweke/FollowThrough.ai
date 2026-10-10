import type {
	AgentExecutionUpdate,
	AgentRun,
	AgentRunContext,
	AgentRunDecisionRecord,
	AgentRunImages,
	RunAgentInput,
	WebResearchSettings
} from '$lib/models/agent';
import type { AgentToolCompletionObserver } from '$lib/models/agent-tool-protocol';
import type { GenerateMermaidDiagramOutput } from '$lib/models/diagrams';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type { FindReferencesOutput } from '$lib/models/references';
import type { RelateSelectionOutput } from '$lib/models/relationships';
import type { Suggestion } from '$lib/models/suggestions';
import type { ExtractPromisesOutput } from '$lib/models/todos';

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
		readonly toolExecutor: AgentToolCompletionObserver;
	}): AsyncIterable<AgentExecutionUpdate>;
}

/**
 * Ghost text fires on every typing pause, so an abandoned request must never
 * queue behind another. `admit` refuses a second concurrent request for one
 * user and anything past the per-minute budget.
 */

/** The run observes completed tool calls as data; it cannot execute a nested controller action. */
export type { AgentToolCompletionObserver } from '$lib/models/agent-tool-protocol';
