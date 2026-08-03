import type { ActorContext } from '$lib/models/identity';
import type {
	AgentExecutionUpdate,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunId,
	Conversation,
	ConversationId,
	ConversationImageInput,
	InlineCompletionContext,
	InlineSuggestionRequest,
	Message,
	RunAgentInput,
	ToolActivity
} from '$lib/models/agent';
import type { ExtractPromisesOutput } from '$lib/models/todos';
import type { FindReferencesOutput } from '$lib/models/references';
import type { GenerateMermaidDiagramOutput } from '$lib/models/diagrams';
import type { Note, NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import type { RelateSelectionOutput } from '$lib/models/relationships';

export interface AgentWorkflowToolbox {
	extractPromises(actor: ActorContext, selection: TextSelection): Promise<ExtractPromisesOutput>;
	relate(actor: ActorContext, selection: TextSelection): Promise<RelateSelectionOutput>;
	reference(actor: ActorContext, selection: TextSelection): Promise<FindReferencesOutput>;
	generateDiagram(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<GenerateMermaidDiagramOutput>;
}
export interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId; conversationId?: ConversationId }
	): Promise<Readonly<Record<string, unknown>>>;
}
export interface AgentRunner {
	execute(input: {
		readonly actor: ActorContext;
		readonly run: AgentRun;
		readonly request: RunAgentInput;
		readonly context: Readonly<Record<string, unknown>>;
		/** Decisions to apply before resuming, one per parked tool call. */
		readonly decisions?: readonly AgentRunDecisionRecord[];
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate>;
}

/** Deterministically assembles note, memory, and project retrieval context. */
export interface InlineCompletionContextBuilder {
	build(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext>;
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
export type InlineSuggestionAdmission =
	| { readonly allowed: true }
	| {
			readonly allowed: false;
			readonly reason: 'busy' | 'rate_limited';
			readonly retryAfterMs: number;
	  };

export interface InlineSuggestionThrottle {
	admit(userId: string): InlineSuggestionAdmission;
	consume(userId: string): InlineSuggestionAdmission;
	release(userId: string): void;
}

export interface AgentToolExecutor {
	execute(
		input: {
			readonly callId: string;
			readonly toolName: string;
			readonly arguments: Readonly<Record<string, unknown>>;
			readonly classification: 'read' | 'proposal' | 'mutation';
		},
		action: () => Promise<unknown>
	): Promise<unknown>;
}
export interface ConversationRecorder {
	getOrCreate(actor: ActorContext, input: RunAgentInput): Promise<Conversation>;
}

export interface ConversationJournal extends ConversationRecorder {
	listConversations(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]>;
	rename(actor: ActorContext, conversationId: ConversationId, title: string): Promise<Conversation>;
	remove(actor: ActorContext, conversationId: ConversationId): Promise<void>;
	createWorkflow(
		actor: ActorContext,
		input: {
			title: string;
			contextProjectId?: ProjectId;
			contextNoteId?: NoteId;
		}
	): Promise<Conversation>;
	get(actor: ActorContext, conversationId: ConversationId): Promise<Conversation>;
	listMessages(actor: ActorContext, conversationId: ConversationId): Promise<readonly Message[]>;
	/** Drop the `ordinal`-th user turn (1-based, user messages only) and all later turns. */
	truncateFromUserMessage(
		actor: ActorContext,
		conversationId: ConversationId,
		ordinal: number
	): Promise<void>;
	recordUserPrompt(
		actor: ActorContext,
		conversationId: ConversationId,
		prompt: string,
		runId?: AgentRunId,
		images?: readonly ConversationImageInput[]
	): Promise<void>;
	recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
	recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
}
