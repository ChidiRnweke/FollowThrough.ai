import type {
	ActorContext,
	AgentExecutionUpdate,
	AgentRun,
	AgentRunDecisionRecord,
	Conversation,
	ConversationId,
	ExtractPromisesOutput,
	FindReferencesOutput,
	GenerateMermaidDiagramOutput,
	InlineContextBrief,
	InlineSuggestionRequest,
	Message,
	ProvenanceId,
	RelateSelectionOutput,
	RunAgentInput,
	TextSelection,
	ToolActivity
} from '$lib/models';

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
		readonly decision?: AgentRunDecisionRecord;
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate>;
}

/**
 * Tier two of inline suggestions: the tool-calling pass that gathers workspace
 * grounding. It runs off the typing path, so it may take seconds.
 */
export interface InlineContextBriefer {
	brief(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineContextBrief>;
}

/**
 * Tier one: the hot path. No tools, no persistence — just the caret window and
 * whatever brief is already warm.
 */
export interface InlineCompletionGenerator {
	complete(
		request: InlineSuggestionRequest,
		brief: InlineContextBrief | undefined,
		signal: AbortSignal
	): Promise<string>;
}

export interface InlineBriefCache {
	get(key: string): InlineContextBrief | undefined;
	set(key: string, brief: InlineContextBrief): void;
}

export interface InlineBriefKeyBuilder {
	(input: {
		readonly userId: string;
		readonly noteId: string;
		readonly heading?: string;
	}): string;
}

/**
 * Ghost text fires on every typing pause, so an abandoned request must never
 * queue behind another. `admit` refuses a second concurrent request for one
 * user and anything past the per-minute budget.
 */
export interface InlineSuggestionThrottle {
	admit(userId: string): boolean;
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
			contextProjectId?: import('$lib/models').ProjectId;
			contextNoteId?: import('$lib/models').NoteId;
		}
	): Promise<Conversation>;
	get(actor: ActorContext, conversationId: ConversationId): Promise<Conversation>;
	listMessages(actor: ActorContext, conversationId: ConversationId): Promise<readonly Message[]>;
	recordUserPrompt(
		actor: ActorContext,
		conversationId: ConversationId,
		prompt: string,
		runId?: import('$lib/models').AgentRunId
	): Promise<void>;
	recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: import('$lib/models').AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
	recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: {
			readonly runId: import('$lib/models').AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
}
