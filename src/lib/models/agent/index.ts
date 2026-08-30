import { z } from 'zod';
import type { PersistedSessionItem } from './session-item';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

export type ConversationId = Brand<string, 'ConversationId'>;

export type MessageId = Brand<string, 'MessageId'>;

export type AgentRunId = Brand<string, 'AgentRunId'>;

export type AgentSessionItemId = Brand<string, 'AgentSessionItemId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly ProseMirrorNodeView[];
}
interface ProseMirrorNodeView {
	readonly type: string;
	readonly text?: string;
	readonly content?: readonly ProseMirrorNodeView[];
}

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

type NoteKind = 'folder' | 'note' | 'skill';

type TodoResponsibility = 'mine' | 'waiting_on';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

export type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

export type ToolClassification = 'read' | 'proposal' | 'mutation';

interface Project {
	readonly id: ProjectId;
	readonly userId: UserId;
	readonly name: string;
	readonly description?: string;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** Whether a pipeline's suggestions auto-accept or wait for review. The `reference` pipeline never auto-accepts regardless of what is stored here. */
export interface TrustPolicy {
	readonly userId: UserId;
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** A chat thread. Its context (project or note) is fixed on the first turn and never changes afterward. */
export interface Conversation {
	readonly id: ConversationId;
	readonly userId: UserId;
	readonly kind: 'chat' | 'workflow';
	readonly contextProjectId?: ProjectId;
	readonly contextNoteId?: NoteId;
	readonly title?: string;
	readonly modelOverride?: string;
	readonly visionModelOverride?: string;
	readonly executionModeOverride?: AgentExecutionMode;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface Message {
	readonly id: MessageId;
	readonly conversationId: ConversationId;
	readonly runId?: AgentRunId;
	readonly eventCursor?: string;
	readonly role: 'user' | 'assistant' | 'tool';
	readonly content: Readonly<Record<string, unknown>>;
	readonly model?: string;
	readonly createdAt: DateTime;
}

/** What every tool call carries, whatever became of it. */
interface ToolActivityBase {
	readonly callId: string;
	readonly name: string;
	readonly input: Readonly<Record<string, unknown>>;
}

/**
 * One tool call, in the state the run left it.
 *
 * `status` is the discriminant, and the payload belongs to the arm that can
 * have it. As three independent optionals beside a status it was possible —
 * and, in `DiagramAuthoring`, actual — to write a `succeeded` row carrying a
 * `failure` and a `failed` row carrying an `output`, because nothing tied the
 * fields to the state they described. Readers then rediscovered the pairing by
 * hand, down to a `tool is ToolActivity & { failure: string }` predicate.
 *
 * `failure` is required on `failed`: a failure with nothing to say is a row
 * that reports something went wrong and refuses to say what. `output` stays
 * optional on `succeeded`, because a tool may legitimately return nothing —
 * and that is a different fact from having failed.
 *
 * There is no `rejected` arm and no `decision` field. Nothing on this side of
 * the wire ever produced either; a rejection is a client-side state that lives
 * on `ChatToolActivity`, and `decision` was set by no writer at all while
 * `archive` faithfully persisted its `null` on every row.
 */
export type ToolActivity =
	| (ToolActivityBase & { readonly status: 'running' })
	| (ToolActivityBase & { readonly status: 'approval_required' })
	| (ToolActivityBase & { readonly status: 'succeeded'; readonly output?: unknown })
	| (ToolActivityBase & { readonly status: 'failed'; readonly failure: string });

export type AgentExecutionMode = 'approval_required' | 'auto_accept';

export type AgentRunStatus =
	'queued' | 'running' | 'awaiting_approval' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

/**
 * Which provider fulfils the agent's web searches. Declared here rather than in
 * the server's web-research module because the settings picker renders the list
 * and the stored preference is validated against it.
 */
export const webSearchEngines = [
	'auto',
	'native',
	'exa',
	'firecrawl',
	'parallel',
	'perplexity'
] as const;

export type WebSearchEngine = (typeof webSearchEngines)[number];

export interface WebResearchOptions {
	readonly engine?: WebSearchEngine;
	readonly maxResults?: number;
	readonly maxTotalResults?: number;
}

export interface WebResearchDefaults {
	readonly engine: NonNullable<WebResearchOptions['engine']>;
	readonly maxResults: number;
	readonly maxTotalResults: number;
}

export const CHAT_WEB_SEARCH_DEFAULTS: WebResearchDefaults = {
	engine: 'exa',
	maxResults: 20,
	maxTotalResults: 40
};

export const DEFAULT_AGENT_MAX_TURNS = 20;

export const normalizeLanguageModelId = (modelId: string): string => {
	const separator = modelId.indexOf(':');
	if (separator <= 0 || modelId.includes('/')) return modelId;
	return `${modelId.slice(0, separator)}/${modelId.slice(separator + 1)}`;
};

export const resolveAttachmentVisionModel = (
	preferences: Pick<AgentPreferences, 'attachmentVisionModel'>,
	environmentDefault: string
): string => normalizeLanguageModelId(preferences.attachmentVisionModel ?? environmentDefault);

export const REFERENCE_WEB_SEARCH_DEFAULTS: WebResearchDefaults = {
	engine: 'exa',
	maxResults: 8,
	maxTotalResults: 16
};

export interface WebResearchTool {
	readonly type: 'openrouter:web_search';
	readonly parameters: {
		readonly engine: NonNullable<WebResearchOptions['engine']>;
		readonly max_results: number;
		readonly max_total_results: number;
	};
}

const webSearchEngineFrom = (value: string | undefined): WebSearchEngine | undefined =>
	webSearchEngines.includes(value as WebSearchEngine) ? (value as WebSearchEngine) : undefined;

const positiveWebSearchIntegerFrom = (value: string | undefined): number | undefined => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const webSearchOptionsFromEnvironment = (
	environment: Readonly<Record<string, string | undefined>>
): WebResearchOptions => {
	const engine = webSearchEngineFrom(environment.OPENROUTER_WEB_SEARCH_ENGINE);
	const maxResults = positiveWebSearchIntegerFrom(environment.OPENROUTER_WEB_SEARCH_MAX_RESULTS);
	const maxTotalResults = positiveWebSearchIntegerFrom(
		environment.OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS
	);
	return {
		...(engine ? { engine } : {}),
		...(maxResults ? { maxResults } : {}),
		...(maxTotalResults ? { maxTotalResults } : {})
	};
};

export const openRouterWebSearchTool = (
	options: WebResearchOptions = {},
	defaults: WebResearchDefaults = CHAT_WEB_SEARCH_DEFAULTS
): WebResearchTool => ({
	type: 'openrouter:web_search',
	parameters: {
		engine: options.engine ?? defaults.engine,
		max_results: options.maxResults ?? defaults.maxResults,
		max_total_results: options.maxTotalResults ?? defaults.maxTotalResults
	}
});

/**
 * The user's agent defaults. Every optional field is absent rather than null
 * when unset, and absent means "use the deployment default" — see the
 * `agent_preferences` table for why that distinction is load-bearing.
 */
export interface AgentPreferences {
	readonly userId: UserId;
	readonly defaultModel?: string;
	readonly defaultVisionModel?: string;
	/** Model behind inline ghost text. Never calls tools, so it need not support them. */
	readonly inlineModel?: string;
	/** Model that reads attachment images and OCRs documents. */
	readonly attachmentVisionModel?: string;
	readonly webSearchEngine?: WebSearchEngine;
	readonly webSearchMaxResults?: number;
	readonly webSearchMaxTotalResults?: number;
	/** Tool-calling turns one chat run may take before it is cut off. */
	readonly agentMaxTurns?: number;
	readonly executionMode: AgentExecutionMode;
	readonly inlineSuggestionsEnabled: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/**
 * One agent tool as the settings surface sees it: its identity from the code,
 * its resolved on/off state, and which layer decided that state.
 *
 * `source` is what lets the UI distinguish "off everywhere" from "off just for
 * this project", which is the only way a per-project override can be reset.
 */
export interface ToolPreference {
	readonly name: string;
	readonly description: string;
	readonly classification: ToolClassification;
	readonly enabled: boolean;
	/** Locked tools are always enabled; turning them off would strand the agent. */
	readonly locked: boolean;
	readonly source: 'default' | 'user' | 'project';
}

/** A tool call parked at an approval checkpoint, waiting for `decide`/`decideMany`. */
export interface PendingAgentDecision {
	readonly callId: string;
	readonly toolName: string;
	readonly arguments: Readonly<Record<string, unknown>>;
}

/** Context available before retrieval-backed grounding is assembled. */
export interface BaseAgentContextData {
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly noteTitle?: string;
	readonly selections?: readonly ContextSelection[];
}

export interface AgentSkillCatalogItem {
	readonly noteId: string;
	readonly name: string;
	readonly description: string;
}

export interface AgentSkillCatalog {
	readonly items: readonly AgentSkillCatalogItem[];
	readonly truncated?: true;
}

/** Fully assembled context consumed by an executable agent run. */
export interface AgentRunContext extends BaseAgentContextData {
	readonly appContext?: ResolvedAgentAppContextV1;
	readonly userMemory?: readonly string[];
	readonly contextNotes: readonly ContextNote[];
	readonly skills: AgentSkillCatalog;
}

export type WorkflowRunContext =
	| { readonly kind: 'note_action'; readonly action: NoteActionKind; readonly noteId: NoteId }
	| {
			readonly kind: 'diagram';
			readonly state: 'unprepared';
			readonly operation: 'generate' | 'revise' | 'convert';
			readonly noteId?: NoteId;
	  }
	| {
			readonly kind: 'diagram';
			readonly state: 'prepared';
			readonly context: AgentRunContext;
			readonly conversationId: ConversationId;
			readonly effectiveModel: string;
			readonly executionMode: 'auto_accept';
			readonly provenanceId: ProvenanceId;
			readonly diagramOperation: 'generate' | 'revise' | 'convert';
	  };

/**
 * A durable run. `serializedState` is what lets an `awaiting_approval` run survive a
 * process restart, and `inputSnapshot` freezes the preferences a retry replays under,
 * not whatever the user's settings have since become.
 */
interface AgentRunBase {
	readonly id: AgentRunId;
	readonly userId: UserId;
	readonly conversationId: ConversationId;
	readonly model: string;
	readonly executionMode: AgentExecutionMode;
	readonly status: AgentRunStatus;
	readonly requestId: string;
	readonly cancelRequestedAt?: DateTime;
	readonly startedAt?: DateTime;
	readonly finishedAt?: DateTime;
	readonly provenanceId?: ProvenanceId;
	readonly serializedState?: string;
	/**
	 * W3C traceparent the next turn of this run should parent to. Seeded at
	 * submit/retry time with the requesting operation's span so the first turn
	 * joins the request's trace; refreshed with the turn's own root whenever the
	 * run parks for approval, so every resume continues that trace instead of
	 * minting a new root. One user request stays one trace in Phoenix.
	 */
	readonly traceparent?: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
	readonly failure?: string;
	readonly providerErrorCode?: string;
	readonly retryOfRunId?: AgentRunId;
	readonly definitionVersion?: number;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface UnpreparedAgentRun extends AgentRunBase {
	readonly kind: 'agent';
	readonly inputSnapshot: RunAgentInput;
	readonly contextSnapshot?: never;
}

export interface PreparedAgentRun extends AgentRunBase {
	readonly kind: 'agent';
	readonly inputSnapshot: RunAgentInput;
	readonly contextSnapshot: AgentRunContext;
}

export type ResolvedAgentRun = UnpreparedAgentRun | PreparedAgentRun;

export interface WorkflowAgentRun extends AgentRunBase {
	readonly kind: 'workflow';
	readonly inputSnapshot?: never;
	readonly contextSnapshot: WorkflowRunContext;
}

export type AgentRun = ResolvedAgentRun | WorkflowAgentRun;

export interface AgentRunReceipt {
	readonly runId: AgentRunId;
	readonly conversationId: ConversationId;
	readonly status: AgentRunStatus;
	readonly latestCursor: string;
}

/** A run plus its pending decisions and event cursor, the shape both the submit receipt and a resumed poll return. */
export interface AgentRunSnapshot {
	readonly run: AgentRun;
	readonly latestCursor: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
}

export interface AgentSessionItem {
	readonly id: AgentSessionItemId;
	readonly conversationId: ConversationId;
	readonly position: number;
	readonly item: PersistedSessionItem;
	readonly createdAt: DateTime;
}

export interface AgentModel {
	readonly id: string;
	readonly name: string;
	readonly provider: string;
	readonly contextLength?: number;
	readonly supportsTools: boolean;
	readonly supportsVision: boolean;
	readonly recommended: boolean;
	readonly capabilities: readonly string[];
}

type SuggestionKind = 'todo' | 'backlink' | 'reference' | 'diagram' | 'memory';

interface SuggestionBase<Kind extends SuggestionKind, Payload> {
	readonly id: SuggestionId;
	readonly userId: UserId;
	readonly noteId?: NoteId;
	readonly kind: Kind;
	readonly status: SuggestionStatus;
	readonly payload: Payload;
	readonly confidence?: Confidence;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly decidedAt?: DateTime;
	readonly expiresAt?: DateTime;
	readonly appliedArtifactId?: string;
	readonly isAutoAccepted: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type TodoSuggestion = SuggestionBase<'todo', CreateTodoInput>;

type BacklinkSuggestion = SuggestionBase<'backlink', CreateRelationshipInput>;

type ReferenceSuggestion = SuggestionBase<'reference', CreateReferenceInput>;

type DiagramSuggestion = SuggestionBase<
	'diagram',
	{
		readonly noteId: NoteId;
		readonly kind: DiagramKind;
		readonly title?: string;
		readonly source: string;
	}
>;

type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;

type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

type MemoryChangeOperation = 'add' | 'update' | 'remove';

interface MemoryChangePayload {
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
}

interface CreateTodoInput {
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly responsibility: TodoResponsibility;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

/**
 * One explicitly attached context note as assembled for a run. At or under the
 * token limit the full content rides inside the user message; a larger note
 * carries no content and the prompt points the model at search_note instead.
 */
export interface ContextNote {
	readonly noteId: NoteId;
	readonly title: string;
	readonly content?: string;
	readonly tokenCount: number;
}

/**
 * One pinned passage as assembled for a run: the selection itself, plus the title of the
 * note it came from when that note is already loaded for this run. The title is optional
 * because resolving one per passage would cost a read apiece to name something the model can
 * ask for with get_note.
 */
export interface ContextSelection extends TextSelection {
	readonly title?: string;
}

/**
 * Every image the model will see on this turn, in one list.
 *
 * `images` and `contextImages` are separate on the way in — one is what the user
 * attached, the other is what the app supplied — and identical from here on: they
 * share the four-image budget, the same size cap, the same vision-model
 * fallback, and they arrive in the same request. Joining them was written out at
 * four separate call sites, one of which is where the budget is enforced.
 */
export const allImages = (request: {
	readonly images?: readonly ConversationImageInput[];
	readonly contextImages?: readonly ConversationImageInput[];
}): readonly ConversationImageInput[] => [
	...(request.images ?? []),
	...(request.contextImages ?? [])
];

export interface StagedAgentRunInput {
	readonly requestId?: string;
	readonly conversationId?: ConversationId;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	/**
	 * The first of `selections`, and only ever that. It is kept as its own field because the
	 * selection-bound tools are offered to the model on the strength of a run having one.
	 */
	readonly selection?: TextSelection;
	/** Every passage the user pinned to this message, in the order they pinned them. */
	readonly selections?: readonly TextSelection[];
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly modelOverride?: string | null;
	readonly visionModelOverride?: string | null;
	readonly executionModeOverride?: AgentExecutionMode | null; /**
	 * Limits resolved from the user's preferences when the run was staged, not
	 * chosen per message. They travel on the request because the services that
	 * honour them are constructed once for the process and never see an actor.
	 */
	readonly maxTurns?: number;
	readonly webSearch?: {
		readonly engine?: WebSearchEngine;
		readonly maxResults?: number;
		readonly maxTotalResults?: number;
	};
	readonly prompt: string;
	readonly images?: readonly ConversationImageInput[];
	/**
	 * Images the model should see that the user did not attach.
	 *
	 * A render of what the agent just drew belongs here rather than in `images`:
	 * the transcript shows what was said, and a picture nobody attached appearing
	 * in someone's own message is a lie about who sent it.
	 */
	readonly contextImages?: readonly ConversationImageInput[];
	readonly appContext?: AppContextSnapshotV1;
	/**
	 * Scope the request was staged with, kept only when the live snapshot
	 * overrode it. The snapshot still wins; this is carried so the agent can be
	 * told what the user was pointing at when they asked.
	 */
	readonly requestedScope?: {
		readonly projectId?: ProjectId;
		readonly noteId?: NoteId;
	};
}

/** A frozen run after its conversation has been resolved. */
export type RunAgentInput = Omit<StagedAgentRunInput, 'conversationId'> & {
	readonly conversationId: ConversationId;
};

export interface ConversationImageInput {
	readonly id: string;
	readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
	readonly dataUrl: string;
	readonly name: string;
}

/**
 * One request for proactive ghost text at the caret. The window around the
 * caret is plain text: the editor serialises the document, so the model never
 * sees ProseMirror JSON on this path.
 */
export interface InlineSuggestionRequest {
	readonly requestId: string;
	readonly noteId: NoteId;
	/** Authoritative project scope, populated by the server controller. */
	readonly projectId?: ProjectId;
	readonly revision: number;
	readonly blockType: string;
	readonly headingPath: readonly string[];
	readonly currentSection: string;
	readonly prefix: string;
	readonly suffix: string;
	readonly heading?: string;
}

export interface InlineCompletionPassage {
	readonly sourceTitle: string;
	readonly sourceType: 'note' | 'attachment' | 'diagram' | 'project-memory';
	readonly sectionPath?: string;
	readonly content: string;
}

/** Raw workspace context assembled deterministically for one caret completion. */
export interface InlineCompletionContext {
	readonly noteTitle: string;
	readonly noteText: string;
	readonly userMemory: readonly string[];
	readonly projectPassages: readonly InlineCompletionPassage[];
}

export interface InlineSuggestionGrounding {
	readonly currentNote: true;
	readonly userMemoryCount: number;
	readonly projectPassageCount: number;
}

export type InlineSuggestion =
	| {
			readonly outcome: 'suggested';
			readonly text: string;
			readonly grounding: InlineSuggestionGrounding;
	  }
	| { readonly outcome: 'no_suggestion'; readonly reason: 'ineligible' | 'empty_model' }
	| { readonly outcome: 'busy' | 'rate_limited'; readonly retryAfterMs: number };

export const inlineSuggestionSchema = z.discriminatedUnion('outcome', [
	z
		.object({
			outcome: z.literal('suggested'),
			text: z.string(),
			grounding: z
				.object({
					currentNote: z.literal(true),
					userMemoryCount: z.number().int().nonnegative(),
					projectPassageCount: z.number().int().nonnegative()
				})
				.strict()
		})
		.strict(),
	z
		.object({
			outcome: z.literal('no_suggestion'),
			reason: z.enum(['ineligible', 'empty_model'])
		})
		.strict(),
	z
		.object({
			outcome: z.enum(['busy', 'rate_limited']),
			retryAfterMs: z.number().int().nonnegative()
		})
		.strict()
]) satisfies z.ZodType<InlineSuggestion>;

export interface SubmitAgentRunInput {
	readonly requestId: string;
	readonly conversationId?: ConversationId;
	readonly input: string;
	readonly images?: readonly ConversationImageInput[];
	/**
	 * Images the model should see that the user did not attach.
	 *
	 * A render of what the agent just drew belongs here rather than in `images`:
	 * the transcript shows what was said, and a picture nobody attached appearing
	 * in someone's own message is a lie about who sent it.
	 */
	readonly contextImages?: readonly ConversationImageInput[];
	readonly model?: string | null;
	readonly visionModel?: string | null;
	readonly mode?: AgentExecutionMode | null;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	/** The first of `selections`; see the note on `RunAgentInput`. */
	readonly selection?: TextSelection;
	readonly selections?: readonly TextSelection[];
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly appContext?: AppContextSnapshotV1;
	/**
	 * One-based position of the user message this submission replaces, counted
	 * among user messages only. Set when a question is edited or asked again: the
	 * conversation is rewound to just before that turn before the new run starts.
	 * Control flag, not part of the frozen input — a retry of the resulting run
	 * must not rewind a second time.
	 */
	readonly retryUserOrdinal?: number;
}

/** The selection-driven note actions that run as their own cancellable workflow run. */
export type NoteActionKind = 'promises' | 'relate' | 'reference' | 'diagram' | 'revise' | 'convert';

export type AgentEvent =
	| {
			readonly type: 'run_queued';
			readonly runId: AgentRunId;
			readonly attempt: number;
			readonly reason: 'submitted' | 'retry' | 'resumed';
	  }
	| { readonly type: 'run_started'; readonly runId: AgentRunId; readonly attempt: number }
	| { readonly type: 'text_delta'; readonly text: string }
	| { readonly type: 'reasoning_delta'; readonly text: string }
	| {
			readonly type: 'tool_started';
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'tool_completed';
			readonly callId: string;
			readonly name: string;
			readonly output?: unknown;
			readonly failure?: string;
	  }
	| {
			readonly type: 'approval_required';
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	| { readonly type: 'suggestion'; readonly suggestion: Suggestion }
	/**
	 * The whole outcome of a note action, carried in the event log so a client
	 * that reconnects after a refresh finishes the action from the replay alone.
	 * Suggestion-backed actions could be re-read from their tables, but a Mermaid
	 * revision is only ever a value in flight — this is what makes it resumable.
	 */
	| {
			readonly type: 'workflow_result';
			readonly action: NoteActionKind;
			readonly result: unknown;
	  }
	| {
			readonly type: 'failed';
			readonly runId?: AgentRunId;
			readonly code: string;
			readonly message: string;
			readonly retryable: boolean;
	  }
	| { readonly type: 'cancelled'; readonly runId: AgentRunId; readonly message: string }
	| {
			readonly type: 'completed';
			readonly conversationId: ConversationId;
			readonly runId?: AgentRunId;
			readonly model?: string;
	  }
	| { readonly type: 'resources_stale'; readonly resources: readonly string[] };

export interface DecideAgentRunInput {
	readonly runId: AgentRunId;
	readonly callId: string;
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
}

/**
 * One turn can park on several tool calls at once, and the user answers them as a batch.
 * Deciding them one at a time would requeue the run between each, so they travel together.
 */
export interface DecideAgentRunBatchInput {
	readonly runId: AgentRunId;
	readonly callIds: readonly string[];
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
}

/** A partial edit: omitted fields keep their stored value, `defaultModel: null` clears it. */
export interface UpdateAgentPreferencesInput {
	readonly defaultModel?: string | null;
	readonly defaultVisionModel?: string | null;
	readonly inlineModel?: string | null;
	readonly attachmentVisionModel?: string | null;
	readonly webSearchEngine?: WebSearchEngine | null;
	readonly webSearchMaxResults?: number | null;
	readonly webSearchMaxTotalResults?: number | null;
	readonly agentMaxTurns?: number | null;
	readonly executionMode?: AgentExecutionMode;
	readonly inlineSuggestionsEnabled?: boolean;
}

type NoteRef = Pick<Note, 'id' | 'title'>;

export interface ConversationSummary {
	readonly id: ConversationId;
	readonly title?: string;
	readonly contextProjectId?: ProjectId;
	readonly contextNoteId?: NoteId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
	readonly project?: Pick<Project, 'id' | 'name'>;
	readonly note?: NoteRef;
}

export interface GetTrustPoliciesOutput {
	readonly policies: readonly TrustPolicy[];
}

export interface UpdateTrustPolicyInput {
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
}

export interface UpdateTrustPolicyOutput {
	readonly policy: TrustPolicy;
}

type AppSurfaceKind =
	| 'today'
	| 'todos'
	| 'project'
	| 'project_todos'
	| 'project_memory'
	| 'project_attachments'
	| 'artifacts'
	| 'note_workbench'
	| 'diagram_editor'
	| 'diagram_studio'
	| 'diagrams'
	| 'chats'
	| 'chat'
	| 'skills'
	| 'skill'
	| 'profile'
	| 'settings'
	| 'unknown';

interface NoteContext {
	readonly id: NoteId;
	readonly title: string;
	readonly projectId: ProjectId;
}

interface PaneContext extends NoteContext {
	readonly revision: number;
	readonly syncStatus: string;
	readonly dirty: boolean;
	readonly dirtyExcerpt?: string;
}

interface SemanticInteraction {
	readonly kind: 'focus' | 'select' | 'open' | 'edit';
	readonly resourceKind: 'note' | 'todo' | 'artifact' | 'diagram' | 'skill' | 'chat';
	readonly resourceId: string;
	readonly occurredAt: string;
}

export interface AppContextSnapshotV1 {
	readonly version: 1;
	readonly capturedAt: string;
	readonly client: {
		readonly locale: string;
		readonly timeZone: string;
		readonly localDate: string;
		readonly layout: 'compact' | 'wide';
	};
	readonly surface: {
		readonly kind: AppSurfaceKind;
		readonly presentation: 'right_panel' | 'full_page';
		readonly filters?: Readonly<Record<string, string | number | boolean>>;
	};
	readonly currentProject?: { readonly id: ProjectId; readonly name: string };
	readonly activeResource?: {
		readonly kind: 'project' | 'note' | 'todo' | 'artifact' | 'diagram' | 'skill' | 'chat';
		readonly id: string;
		readonly title: string;
		readonly projectId?: ProjectId;
	};
	readonly workbench?: {
		readonly openTabs: readonly NoteContext[];
		readonly visiblePanes: readonly PaneContext[];
		readonly focusedNoteId?: NoteId;
		readonly otherVisibleNoteId?: NoteId;
		readonly openChatTabs?: readonly {
			readonly sessionKey: string;
			readonly conversationId?: string;
			readonly title: string;
		}[];
	};
	readonly selection?: TextSelection;
	readonly recentInteractions: readonly SemanticInteraction[];
}

export type ProjectTransition =
	'same_project' | 'different_project' | 'origin_unscoped' | 'screen_unscoped';

export interface ResolvedAgentAppContextV1 extends AppContextSnapshotV1 {
	readonly conversationOrigin: {
		readonly projectId?: ProjectId;
		readonly projectName?: string;
		readonly noteId?: NoteId;
	};
	readonly projectTransition: ProjectTransition;
	readonly requestedScope?: {
		readonly projectId?: ProjectId;
		readonly projectName?: string;
		readonly noteId?: NoteId;
		readonly noteTitle?: string;
		readonly note: string;
	};
}

const brandedUuid = <T extends string>() => z.uuid().transform((value) => value as T);
const conversationIdSchema = brandedUuid<ConversationId>();
const projectIdSchema = brandedUuid<ProjectId>();
const noteIdSchema = brandedUuid<NoteId>();
const textSelectionSchema = z
	.object({
		noteId: noteIdSchema,
		revision: z.number().int().nonnegative(),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		text: z.string()
	})
	.strict();
const conversationImageSchema = z
	.object({
		/**
		 * A uuid, and both producers mint one deliberately because of it —
		 * `rememberCanvasRender` says so in as many words, having been changed from a
		 * readable `canvas-<key>` that this boundary rejected and that failed the
		 * whole message. Loosening this to a bare string left that comment describing
		 * a rule nothing enforced any more, so the next id to be minted readably
		 * would reach the server and fail somewhere further in.
		 */
		id: z.string().uuid(),
		mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
		dataUrl: z.string(),
		name: z.string()
	})
	.strict();
const ianaTimeZoneSchema = z.string().refine(
	(value) => {
		try {
			new Intl.DateTimeFormat('en', { timeZone: value });
			return true;
			// audit-allow: silent-catch — Zod refine converts Intl's RangeError into an explicit validation failure.
		} catch {
			return false;
		}
	},
	{ message: 'Client timeZone must be a valid IANA time zone' }
);
const appContextSnapshotSchema = z
	.object({
		version: z.literal(1),
		capturedAt: z.iso.datetime(),
		client: z
			.object({
				locale: z.string(),
				timeZone: ianaTimeZoneSchema,
				localDate: z.string(),
				layout: z.enum(['compact', 'wide'])
			})
			.strict(),
		surface: z
			.object({
				kind: z.enum([
					'today',
					'todos',
					'project',
					'project_todos',
					'project_memory',
					'project_attachments',
					'artifacts',
					'note_workbench',
					'diagram_editor',
					'diagram_studio',
					'diagrams',
					'chats',
					'chat',
					'skills',
					'skill',
					'profile',
					'settings',
					'unknown'
				]),
				presentation: z.enum(['right_panel', 'full_page']),
				filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
			})
			.strict(),
		currentProject: z.object({ id: projectIdSchema, name: z.string() }).strict().optional(),
		activeResource: z
			.object({
				kind: z.enum(['project', 'note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
				id: z.string(),
				title: z.string(),
				projectId: projectIdSchema.optional()
			})
			.strict()
			.optional(),
		workbench: z
			.object({
				openTabs: z.array(
					z.object({ id: noteIdSchema, title: z.string(), projectId: projectIdSchema }).strict()
				),
				visiblePanes: z.array(
					z
						.object({
							id: noteIdSchema,
							title: z.string(),
							projectId: projectIdSchema,
							revision: z.number().int().nonnegative(),
							syncStatus: z.string(),
							dirty: z.boolean(),
							dirtyExcerpt: z.string().optional()
						})
						.strict()
				),
				focusedNoteId: noteIdSchema.optional(),
				otherVisibleNoteId: noteIdSchema.optional(),
				openChatTabs: z
					.array(
						z
							.object({
								sessionKey: z.string(),
								conversationId: z.string().min(1).optional(),
								title: z.string()
							})
							.strict()
					)
					.optional()
			})
			.strict()
			.optional(),
		selection: textSelectionSchema.optional(),
		recentInteractions: z.array(
			z
				.object({
					kind: z.enum(['focus', 'select', 'open', 'edit']),
					resourceKind: z.enum(['note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
					resourceId: z.string(),
					occurredAt: z.iso.datetime()
				})
				.strict()
		)
	})
	.strict();

const resolvedAgentAppContextSchema: z.ZodType<ResolvedAgentAppContextV1> = appContextSnapshotSchema
	.extend({
		conversationOrigin: z
			.object({
				projectId: projectIdSchema.optional(),
				projectName: z.string().optional(),
				noteId: noteIdSchema.optional()
			})
			.strict(),
		projectTransition: z.enum([
			'same_project',
			'different_project',
			'origin_unscoped',
			'screen_unscoped'
		]),
		requestedScope: z
			.object({
				projectId: projectIdSchema.optional(),
				projectName: z.string().optional(),
				noteId: noteIdSchema.optional(),
				noteTitle: z.string().optional(),
				note: z.string()
			})
			.strict()
			.optional()
	})
	.strict();

const contextSelectionSchema = textSelectionSchema
	.extend({ title: z.string().optional() })
	.strict();
const contextNoteSchema = z
	.object({
		noteId: noteIdSchema,
		title: z.string(),
		content: z.string().optional(),
		tokenCount: z.number().int().nonnegative()
	})
	.strict();
const agentSkillCatalogItemSchema = z
	.object({ noteId: z.string(), name: z.string(), description: z.string() })
	.strict();

export const agentRunContextSchema: z.ZodType<AgentRunContext> = z
	.object({
		projectId: projectIdSchema.optional(),
		noteId: noteIdSchema.optional(),
		noteTitle: z.string().optional(),
		selections: z.array(contextSelectionSchema).optional(),
		appContext: resolvedAgentAppContextSchema.optional(),
		userMemory: z.array(z.string()).optional(),
		contextNotes: z.array(contextNoteSchema),
		skills: z
			.object({
				items: z.array(agentSkillCatalogItemSchema),
				truncated: z.literal(true).optional()
			})
			.strict()
	})
	.strict();

const noteActionRunContextSchema = z
	.object({
		kind: z.literal('note_action'),
		action: z.enum(['promises', 'relate', 'reference', 'diagram', 'revise', 'convert']),
		noteId: noteIdSchema
	})
	.strict();
const unpreparedDiagramRunContextSchema = z
	.object({
		kind: z.literal('diagram'),
		state: z.literal('unprepared'),
		operation: z.enum(['generate', 'revise', 'convert']),
		noteId: noteIdSchema.optional()
	})
	.strict();
const preparedDiagramRunContextSchema = z
	.object({
		kind: z.literal('diagram'),
		state: z.literal('prepared'),
		context: agentRunContextSchema,
		conversationId: conversationIdSchema,
		effectiveModel: z.string(),
		executionMode: z.literal('auto_accept'),
		provenanceId: brandedUuid<ProvenanceId>(),
		diagramOperation: z.enum(['generate', 'revise', 'convert'])
	})
	.strict();

export const workflowRunContextSchema: z.ZodType<WorkflowRunContext> = z.union([
	noteActionRunContextSchema,
	unpreparedDiagramRunContextSchema,
	preparedDiagramRunContextSchema
]);

const emptyContextSchema = z.object({}).strict();
const legacyNoteActionRunContextSchema = noteActionRunContextSchema.omit({ kind: true });
const legacyDiagramRunContextSchema = unpreparedDiagramRunContextSchema.omit({
	kind: true,
	state: true
});

export const parseAgentRunContextSnapshot = (value: unknown): AgentRunContext | undefined => {
	if (emptyContextSchema.safeParse(value).success) return undefined;
	return agentRunContextSchema.parse(value);
};

export const parseWorkflowRunContext = (value: unknown): WorkflowRunContext => {
	const current = workflowRunContextSchema.safeParse(value);
	if (current.success) return current.data;
	const noteAction = legacyNoteActionRunContextSchema.safeParse(value);
	if (noteAction.success) return { kind: 'note_action', ...noteAction.data };
	const diagram = legacyDiagramRunContextSchema.safeParse(value);
	if (diagram.success) return { kind: 'diagram', state: 'unprepared', ...diagram.data };
	return workflowRunContextSchema.parse(value);
};

const submittedSelectionSchema = textSelectionSchema.extend({ text: z.string().max(12_000) });
const submittedImagesSchema = z.array(conversationImageSchema).max(4).optional();

export const agentRunIdInputSchema = z.object({
	runId: z
		.string()
		.uuid()
		.transform((value) => value as AgentRunId)
});

export const submitAgentRunInputSchema = z
	.object({
		requestId: z.string().uuid(),
		conversationId: conversationIdSchema.optional(),
		input: z.string().trim(),
		images: submittedImagesSchema,
		contextImages: submittedImagesSchema,
		model: z.string().nullable().optional(),
		visionModel: z.string().nullable().optional(),
		mode: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
		projectId: projectIdSchema.optional(),
		noteId: noteIdSchema.optional(),
		selection: submittedSelectionSchema.optional(),
		selections: z.array(submittedSelectionSchema).max(8).optional(),
		contextNoteIds: z.array(noteIdSchema).optional(),
		requestedSkillNames: z.array(z.string()).optional(),
		requestedSkillNoteIds: z.array(noteIdSchema).optional(),
		appContext: appContextSnapshotSchema.optional(),
		retryUserOrdinal: z.number().int().min(1).optional()
	})
	.refine((input) => input.input.length > 0 || Boolean(input.images?.length), {
		message: 'A message or image is required.'
	}) satisfies z.ZodType<SubmitAgentRunInput>;

export const stagedAgentRunInputSchema = z
	.object({
		requestId: z.string().optional(),
		conversationId: conversationIdSchema.optional(),
		projectId: projectIdSchema.optional(),
		noteId: noteIdSchema.optional(),
		selection: textSelectionSchema.optional(),
		selections: z.array(textSelectionSchema).optional(),
		contextNoteIds: z.array(noteIdSchema).optional(),
		requestedSkillNames: z.array(z.string()).optional(),
		requestedSkillNoteIds: z.array(noteIdSchema).optional(),
		modelOverride: z.string().nullable().optional(),
		visionModelOverride: z.string().nullable().optional(),
		executionModeOverride: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
		maxTurns: z.number().int().positive().optional(),
		webSearch: z
			.object({
				engine: z.enum(webSearchEngines).optional(),
				maxResults: z.number().int().positive().optional(),
				maxTotalResults: z.number().int().positive().optional()
			})
			.strict()
			.optional(),
		prompt: z.string(),
		images: z.array(conversationImageSchema).optional(),
		contextImages: z.array(conversationImageSchema).optional(),
		appContext: appContextSnapshotSchema.optional(),
		requestedScope: z
			.object({ projectId: projectIdSchema.optional(), noteId: noteIdSchema.optional() })
			.strict()
			.optional()
	})
	.strict() satisfies z.ZodType<StagedAgentRunInput>;

export const runAgentInputSchema = stagedAgentRunInputSchema.safeExtend({
	conversationId: conversationIdSchema
}) satisfies z.ZodType<RunAgentInput>;

export const resolveAgentRunInput = (
	input: StagedAgentRunInput,
	conversationId: ConversationId
): RunAgentInput => runAgentInputSchema.parse({ ...input, conversationId });

export const parseRunAgentInput = (
	input: unknown,
	expectedConversationId: ConversationId
): RunAgentInput =>
	runAgentInputSchema
		.refine((candidate) => candidate.conversationId === expectedConversationId, {
			path: ['conversationId'],
			message: 'Run input conversation does not match its persisted run'
		})
		.parse(input);

/**
 * What one turn of a run reports back.
 *
 * It lives beside the session-item union rather than in `agent-runs.ts` because
 * it carries one: that file is a self-contained persistence projection that may
 * not import a sibling, and duplicating a six-arm union to satisfy the rule
 * would be worse than moving the one type that needs it.
 */
export type AgentExecutionUpdate =
	| { readonly type: 'event'; readonly event: AgentEvent }
	| {
			readonly type: 'approval_checkpoint';
			readonly serializedState: string;
			readonly traceparent?: string;
			readonly pendingDecisions: readonly PendingAgentDecision[];
			readonly sessionItems: readonly PersistedSessionItem[];
	  }
	| {
			readonly type: 'completed';
			readonly sessionItems: readonly PersistedSessionItem[];
	  };

export * from './agent-runs';
export * from './session-item';
