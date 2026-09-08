import { z } from 'zod';
import type { PersistedSessionItem } from './session-item';
import { AgentProviderFailure } from './agent-runs';
import {
	AGENT_TOOL_NAME_VALUES,
	TOOL_NAME_VALUES,
	type AgentToolName,
	type ToolName
} from './tool-catalog';
import {
	readAgentPayload,
	readAgentPayloadObject,
	type AgentPayload,
	type AgentPayloadObject
} from './payload';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

export type ConversationId = Brand<string, 'ConversationId'>;

export type MessageId = Brand<string, 'MessageId'>;

export type AgentRunId = Brand<string, 'AgentRunId'>;

export type AgentSessionItemId = Brand<string, 'AgentSessionItemId'>;

type DateTime = Brand<string, 'DateTime'>;

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

export type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

export type ToolClassification = 'read' | 'proposal' | 'mutation';

/**
 * How one controller method participates in the agent tool surface.
 *
 * The generic map is model-owned, but its controller type argument is supplied
 * at the server registry seam. That keeps controller imports out of models
 * while making every controller method an explicit decision. A method may own
 * several wire contracts because aliases such as `search` / `search_note` and
 * `save_note` / `edit_note` deliberately adapt one capability in different
 * ways.
 */
export type AgentToolContractBinding =
	| {
			readonly kind: ToolClassification;
			readonly tools: readonly ToolName[];
	  }
	| { readonly kind: 'excluded'; readonly reason: string };

export type AgentToolContractMap<Controllers> = {
	readonly [Controller in keyof Controllers]: {
		readonly [Method in keyof Controllers[Controller]]: AgentToolContractBinding;
	};
};

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
	readonly content: AgentPayloadObject;
	readonly model?: string;
	readonly createdAt: DateTime;
}

/**
 * One journalled message as it comes back off the database.
 *
 * `messages.content` is a `jsonb` column that was handed out under
 * `$type<AgentPayloadObject>()` with nothing checking it, and `listMessages`
 * maps every row of a conversation — the shape that took `/today` down in
 * TN-14. So the read is a union and the write type stays {@link Message}.
 *
 * The union hangs off `content` alone, because `content` is the only column
 * that can fail to read. `id`, `role`, `runId` and `eventCursor` are ordinary
 * columns and are present on both arms, so ordering, run grouping and
 * truncation are total over a stored message without narrowing first.
 *
 * An unreadable row stays in the transcript rather than being dropped: the
 * work was attempted, and a turn that silently loses a row reports doing less
 * than it did. `ChatPart` already has the `unreadable` arm that renders it.
 */
export type StoredMessage = Omit<Message, 'content'> &
	(
		| { readonly kind: 'readable'; readonly content: AgentPayloadObject }
		| { readonly kind: 'unreadable'; readonly reason: string }
	);

/** What every tool call carries, whatever became of it. */
interface ToolActivityBase {
	/**
	 * Absent on an outcome the provider reported without an identifier that the
	 * run could not correlate either. The client settles such a row by name and
	 * recency, which it can only do if the absence survives the journal.
	 */
	readonly callId?: string;
	readonly name: AgentToolName;
	readonly input: AgentPayloadObject;
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
 * `reported_failure` is the third outcome and not a variety of the other two: a
 * tool that returns its failure as a value (ADR 0035) has both a failure and the
 * detail it came from, and journalling it as `failed` threw that detail away on
 * one row in five. Both fields are required there for the same reason `failure`
 * is required on `failed` — neither is producible without the other.
 *
 * There is no `rejected` arm and no `decision` field. Nothing on this side of
 * the wire ever produced either; a rejection is a client-side state that lives
 * on `ChatToolActivity`, and `decision` was set by no writer at all while
 * `archive` faithfully persisted its `null` on every row.
 */
export type ToolActivity =
	| (ToolActivityBase & { readonly status: 'running' })
	| (ToolActivityBase & { readonly status: 'approval_required' })
	| (ToolActivityBase & { readonly status: 'succeeded'; readonly output?: AgentPayload })
	| (ToolActivityBase & {
			readonly status: 'reported_failure';
			readonly failure: string;
			readonly output: AgentPayload;
	  })
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

/** Resolved settings have no database timestamps when the account uses defaults. */
export type AgentPreferenceValues = Omit<AgentPreferences, 'createdAt' | 'updatedAt'>;

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

/**
 * A tool call parked at an approval checkpoint, waiting for `decide`/`decideMany`.
 *
 * `toolName` is a {@link ToolName}, not a string: a park on a name no tool
 * answers can never be approved, so the value is read where it is produced —
 * `parkedCall` for a provider interruption, {@link readPendingDecisions} for a
 * stored row. `search_tools` is deliberately not admitted here; it is a read
 * and never parks.
 */
export interface PendingAgentDecision {
	readonly callId: string;
	readonly toolName: ToolName;
	readonly arguments: AgentPayloadObject;
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
			readonly name: AgentToolName;
			readonly arguments: AgentPayloadObject;
	  }
	/**
	 * The three tool outcomes. `callId` is optional on all of them and absent when
	 * the provider reported the outcome without an identifier and the run could
	 * not correlate one either — several calls were in flight, or none was. The
	 * client settles such a row by name and recency (`matchToolActivity`), which
	 * it can only do if the server says the id is missing rather than spelling
	 * it `''`.
	 *
	 * The call ran and returned. `output` is absent only when the tool returned
	 * nothing at all — `ProviderToolOutput`'s `none` kind — which is a normal
	 * outcome for a mutation whose receipt is the mutation.
	 *
	 * The value is already read into the wire type by the factory before the call
	 * left it. It was `unknown`, so the journal, the replay and every client
	 * surface narrowed the same JSON again for itself.
	 */
	| {
			readonly type: 'tool_succeeded';
			readonly callId?: string;
			readonly name: AgentToolName;
			readonly output?: AgentPayload;
	  }
	/**
	 * The call ran, returned, and the value it returned says it failed.
	 *
	 * `edit_note` is why this exists: a thrown error is stringified to a bare
	 * message and strips the occurrence counts and nearest matches the model needs
	 * to correct itself, so the failure comes back as a value instead (ADR 0035).
	 * Both fields are required because the failure is *read out of* the output —
	 * neither can be present without the other, and the pair used to be two
	 * optionals on one arm, which made `{ failure }` with no detail sayable and
	 * made both consumers drop the detail on the floor. 30 of the 147 stored
	 * `tool_completed` rows are this case.
	 */
	| {
			readonly type: 'tool_reported_failure';
			readonly callId?: string;
			readonly name: AgentToolName;
			readonly failure: string;
			readonly output: AgentPayload;
	  }
	/** The call did not produce a usable result: it threw, or its result was unreadable. */
	| {
			readonly type: 'tool_failed';
			readonly callId?: string;
			readonly name: AgentToolName;
			readonly failure: string;
	  }
	| {
			readonly type: 'approval_required';
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly name: AgentToolName;
			readonly arguments: AgentPayloadObject;
	  }
	/**
	 * The whole outcome of a note action, carried in the event log so a client
	 * that reconnects after a refresh finishes the action from the replay alone.
	 * Suggestion-backed actions could be re-read from their tables, but a Mermaid
	 * revision is only ever a value in flight — this is what makes it resumable.
	 */
	| {
			readonly type: 'workflow_result';
			readonly action: NoteActionKind;
			readonly result: AgentPayload;
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

/**
 * A run event as persisted and replayed. It carries the domain union directly:
 * the record was once a second, private copy of `AgentEvent` in a sibling file
 * that could not import this barrel — an outdated declaration that spread
 * `Readonly<Record<string, unknown>>` arguments and an `any` suggestion across
 * every replay, diverging from the type the repository wrote and the client
 * parsed.
 */
interface AgentRunEventIdentity {
	readonly cursor: string;
	readonly runId: AgentRunId;
	readonly attempt: number;
	readonly createdAt: Date;
}

export interface AgentRunEventRecord extends AgentRunEventIdentity {
	readonly event: AgentEvent;
}

/**
 * A replayed row before anyone has decided what to do about an unreadable one.
 *
 * The identity survives either way, because the cursor is what a warning has to
 * name and what a client has to advance past.
 */
export type StoredAgentRunEventRecord =
	| ({ readonly kind: 'readable' } & AgentRunEventRecord)
	| (AgentRunEventIdentity & { readonly kind: 'unreadable'; readonly reason: string });

/**
 * The same, off the wire, where a frame that does not parse has no identity to
 * report either — the cursor was part of what failed to read.
 */
export type ReadAgentRunEventRecord =
	| ({ readonly kind: 'readable' } & AgentRunEventRecord)
	| { readonly kind: 'unreadable'; readonly reason: string };

/**
 * A stored event row, read.
 *
 * A read-boundary union rather than a sixth `unrecognised` arm on `AgentEvent`,
 * for the reason `StoredSuggestion` is one: `AgentEvent` is the *write* type as
 * well, and an arm nothing can produce is a state a producer could nonetheless
 * say. The disjunction stops at the caller that can act on it — the controller
 * drops the unreadable rows and warns with their cursors — so no consumer of a
 * replayed event sees a case it cannot render.
 */
export type StoredAgentEvent =
	| { readonly kind: 'readable'; readonly event: AgentEvent }
	| { readonly kind: 'unreadable'; readonly reason: string };

/**
 * The JSON a tool call carried, read with {@link readAgentPayload} rather than a
 * zod schema. `z.record` accepts a `Date` — which has no enumerable keys — and
 * parses it clean to `{}`, which is the silent wrong answer this whole exercise
 * removes, so the value reaches the hand-written reader untouched.
 */
const eventPayloadSchema = z
	.custom<unknown>(() => true)
	.transform((value, context) => {
		const read = readAgentPayload(value);
		if (read.kind === 'corrupt') {
			context.addIssue({ code: 'custom', message: read.message });
			return z.NEVER;
		}
		return read.value;
	});

const eventPayloadObjectSchema = z
	.custom<unknown>(() => true)
	.transform((value, context) => {
		const read = readAgentPayloadObject(value);
		if (read.kind === 'corrupt') {
			context.addIssue({ code: 'custom', message: read.message });
			return z.NEVER;
		}
		return read.value;
	});

const runIdSchema = z.string().transform((value) => value as AgentRunId);

/** A catalog tool name. `search_tools` is not one; see {@link agentToolNameSchema}. */
const toolNameSchema = z.enum(TOOL_NAME_VALUES);

/**
 * Every name the agent surface can produce, catalog or not.
 *
 * Stored events and journalled tool rows are parsed with this rather than
 * `z.string()`: across the 2554 run events and 129 tool messages in
 * `tests/corpus/`, the only name outside the catalog is `search_tools`, which
 * `AgentTools.agentTools()` assembles rather than defines.
 */
export const agentToolNameSchema = z.enum(AGENT_TOOL_NAME_VALUES);

export const pendingAgentDecisionSchema = z
	.object({
		callId: z.string().min(1),
		toolName: toolNameSchema,
		arguments: eventPayloadObjectSchema
	})
	.strict() satisfies z.ZodType<PendingAgentDecision>;

/** The call id of a decision that did not parse, for the warning that reports it. */
// audit-allow: no-unknown-type — Reads a provider row id before anything has parsed the row.
const readCallId = (row: unknown): string | undefined =>
	z.object({ callId: z.string() }).safeParse(row).data?.callId;

/**
 * Reads the `agent_runs.pending_decisions` column.
 *
 * A decision that does not read is dropped rather than raised on: the run row
 * still has to be readable so the user can cancel the run, and a resume that
 * lands on none of its interruptions already fails loudly with "The pending
 * approval could not be resumed". The dropped call ids come back so the caller
 * can warn with them, which is what `SuggestionInbox.listByStatus` does with
 * unreadable suggestion rows.
 *
 * The column holds in-flight state only — cleared on resume and by
 * `abandonPendingCalls`, and empty in every stored row when this boundary was
 * written — so there is no legacy shape to map here, and nothing for the
 * corpus to capture.
 */
export const readPendingDecisions = (
	// audit-allow: no-unknown-type — The stored pending_decisions jsonb, which the column hands out unparsed.
	value: unknown
): { readonly decisions: readonly PendingAgentDecision[]; readonly dropped: readonly string[] } => {
	if (!Array.isArray(value)) return { decisions: [], dropped: [] };
	const rows: readonly unknown[] = value;
	const decisions: PendingAgentDecision[] = [];
	const dropped: string[] = [];
	for (const row of rows) {
		const parsed = pendingAgentDecisionSchema.safeParse(row);
		if (parsed.success) decisions.push(parsed.data);
		else dropped.push(readCallId(row) ?? 'unidentified');
	}
	return { decisions, dropped };
};

const toolOutcomeSchemas = [
	z.object({
		type: z.literal('tool_succeeded'),
		callId: z.string().optional(),
		name: agentToolNameSchema,
		output: eventPayloadSchema.optional()
	}),
	z.object({
		type: z.literal('tool_reported_failure'),
		callId: z.string().optional(),
		name: agentToolNameSchema,
		failure: z.string(),
		output: eventPayloadSchema
	}),
	z.object({
		type: z.literal('tool_failed'),
		callId: z.string().optional(),
		name: agentToolNameSchema,
		failure: z.string()
	})
] as const;

const agentEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('run_queued'),
		runId: runIdSchema,
		attempt: z.number().int(),
		reason: z.enum(['submitted', 'retry', 'resumed'])
	}),
	z.object({ type: z.literal('run_started'), runId: runIdSchema, attempt: z.number().int() }),
	z.object({ type: z.literal('text_delta'), text: z.string() }),
	z.object({ type: z.literal('reasoning_delta'), text: z.string() }),
	z.object({
		type: z.literal('tool_started'),
		callId: z.string(),
		name: agentToolNameSchema,
		arguments: eventPayloadObjectSchema
	}),
	...toolOutcomeSchemas,
	z.object({
		type: z.literal('approval_required'),
		runId: runIdSchema,
		callId: z.string(),
		name: agentToolNameSchema,
		arguments: eventPayloadObjectSchema
	}),
	z.object({
		type: z.literal('workflow_result'),
		action: z.enum(['promises', 'relate', 'reference', 'diagram', 'revise', 'convert']),
		result: eventPayloadSchema
	}),
	z.object({
		type: z.literal('failed'),
		runId: runIdSchema.optional(),
		code: z.string(),
		message: z.string(),
		retryable: z.boolean()
	}),
	z.object({ type: z.literal('cancelled'), runId: runIdSchema, message: z.string() }),
	z.object({
		type: z.literal('completed'),
		conversationId: z.string().transform((value) => value as ConversationId),
		runId: runIdSchema.optional(),
		model: z.string().optional()
	}),
	z.object({ type: z.literal('resources_stale'), resources: z.array(z.string()) })
]) satisfies z.ZodType<AgentEvent>;

/** The three events that settle a call, for readers that treat them alike. */
export type ToolOutcomeEvent = Extract<
	AgentEvent,
	{ readonly type: 'tool_succeeded' | 'tool_reported_failure' | 'tool_failed' }
>;

/**
 * The outcome an event settles, or nothing when it settles none.
 *
 * "Did this call finish?" is one question with one answer, and asking it as a
 * three-way `type` test at every reader is how the old single arm's
 * `!event.failure` test came to mean three different things in three files.
 */
export const toolOutcomeEvent = (event: AgentEvent): ToolOutcomeEvent | undefined =>
	event.type === 'tool_succeeded' ||
	event.type === 'tool_reported_failure' ||
	event.type === 'tool_failed'
		? event
		: undefined;

/**
 * The journal row an event calls for, or nothing when the event is not about a
 * tool call.
 *
 * Model-owned because two services need it and a service may not import
 * another: `AgentRunLifecycle` journals every run's calls, and
 * `DiagramAuthoring` journals its own. They held a copy each, and the copies
 * had already diverged — the diagram one wrote `output: undefined` onto a
 * `succeeded` row, which the wire type cannot carry.
 */
export const toolActivityFromEvent = (event: AgentEvent): ToolActivity | undefined => {
	if (event.type === 'tool_started')
		return { callId: event.callId, name: event.name, input: event.arguments, status: 'running' };
	if (event.type === 'approval_required')
		return {
			callId: event.callId,
			name: event.name,
			input: event.arguments,
			status: 'approval_required'
		};
	const outcome = toolOutcomeEvent(event);
	if (!outcome) return undefined;
	// The arguments are not restated on an outcome, and the row that opened the
	// call is the one that holds them; both journals key rows by `callId`.
	const settled = {
		...(outcome.callId === undefined ? {} : { callId: outcome.callId }),
		name: outcome.name,
		input: {}
	};
	if (outcome.type === 'tool_succeeded')
		return {
			...settled,
			...(outcome.output === undefined ? {} : { output: outcome.output }),
			status: 'succeeded'
		};
	return outcome.type === 'tool_failed'
		? { ...settled, failure: outcome.failure, status: 'failed' }
		: { ...settled, failure: outcome.failure, output: outcome.output, status: 'reported_failure' };
};

/**
 * One stored row as an event, or the reason it could not be read.
 *
 * A row that does not parse degrades to one skipped event rather than throwing:
 * `toNote` mapped every row of a note list and a single unmodelled attribute
 * took `/today` down whole (TN-14). A replay is the same shape of read.
 *
 * There is no mapping for the retired `tool_completed` shape. The rows written
 * under it read as `unreadable` and are dropped from replay with a warning
 * naming their cursors: replay only drives a run still in flight, and a reopened
 * conversation reads the journal instead.
 */
// audit-allow: no-unknown-type — The stored event row, at the boundary that turns it into a StoredAgentEvent.
export const readAgentEvent = (value: unknown): StoredAgentEvent => {
	const parsed = agentEventSchema.safeParse(value);
	return parsed.success
		? { kind: 'readable', event: parsed.data }
		: { kind: 'unreadable', reason: z.prettifyError(parsed.error) };
};

const agentRunEventFrameSchema = z.object({
	cursor: z.string(),
	runId: runIdSchema,
	attempt: z.number().int(),
	event: agentEventSchema,
	createdAt: z.iso.datetime().transform((value) => new Date(value))
});

/**
 * One frame off the run's event stream.
 *
 * The server serialized a record it had parsed, but the client receives text
 * from a socket and the two ends are versioned separately: a tab left open
 * across a deploy is served by the new stream and reads it with the old union,
 * or the reverse. The `createdAt` conversion is the visible half of that — JSON
 * has no date — and the rest of the record was riding on the same assertion.
 */
// audit-allow: no-unknown-type — The SSE frame as it arrives; this function is the frame reader.
export const readAgentRunEventRecord = (value: unknown): ReadAgentRunEventRecord => {
	const parsed = agentRunEventFrameSchema.safeParse(value);
	return parsed.success
		? { kind: 'readable', ...parsed.data }
		: { kind: 'unreadable', reason: z.prettifyError(parsed.error) };
};

/**
 * What the provider streamed, as this application acts on it.
 *
 * The runner's events used to be read through a structural stand-in: a
 * `type: string` discriminant, an item whose only method was `toJSON(): unknown`,
 * nine `unknown` fields behind a schema of nine `z.json()` calls, and a
 * cast-probe onto `Record<string, unknown>` to reach reasoning text. None of it
 * checked anything.
 *
 * The call id was the expensive part. It was resolved as
 * `String(item?.callId ?? raw.callId ?? raw.call_id ?? raw.id ?? '')`, so a
 * provider that omitted the id and a provider that sent a number both reached
 * the approval matcher as a string — one as `''`, the other as `'[object
 * Object]'` — and the resume at an approval checkpoint decides which parked call
 * a user's decision applies to by comparing exactly that value. Two calls
 * missing an id compared equal.
 *
 * This union is the decision about what a stream event is. It is parsed once, at
 * the top of the run loop, and every mapper below it receives a total value.
 * `ignored` is an arm rather than `undefined` for the reason
 * {@link UnrecognisedSessionItem} is one: the SDK version is not pinned, and a
 * reader must not be able to mistake "there is nothing to do here" for "this
 * parsed".
 */
export type ProviderStreamEvent =
	| { readonly type: 'tool_called'; readonly call: ProviderToolCall }
	| { readonly type: 'tool_output'; readonly call: ProviderToolCall }
	/** One completed reasoning item, which providers that stream no deltas send instead. */
	| { readonly type: 'reasoning_item'; readonly text: string }
	| { readonly type: 'reasoning_delta'; readonly text: string }
	| { readonly type: 'text_delta'; readonly text: string }
	| { readonly type: 'ignored' };

/**
 * A tool's return value: absent, readable, or unreadable.
 *
 * Three arms rather than an optional payload because they are three different
 * facts, and "the tool returned nothing" reported when "the tool returned
 * something nobody here can read" happened is the case ADR 0015 exists for. The
 * mapper is the caller that knows what to do with each, so the disjunction stops
 * here rather than being resolved into a default.
 */
export type ProviderToolOutput =
	| { readonly kind: 'none' }
	| { readonly kind: 'value'; readonly value: AgentPayload }
	| { readonly kind: 'corrupt'; readonly message: string };

/** One tool call as the provider described it, with the three id spellings resolved. */
export interface ProviderToolCall {
	/**
	 * Absent when the provider reported the call without one, which happens on
	 * outputs. Never `''`: the caller decides what to do about a call it cannot
	 * name, and it cannot decide that if absence is spelled as a value.
	 */
	readonly callId: string | undefined;
	readonly name: string;
	readonly arguments: AgentPayloadObject;
	readonly output: ProviderToolOutput;
}

/**
 * The value a tool returned, taken out of the item without validation so
 * {@link readAgentPayload} can classify it.
 *
 * A `z.record`-shaped JSON schema accepts a `Date` — which has no enumerable
 * keys — and parses it to `{}`. That is the silent wrong answer `payload.ts` is
 * hand-written to avoid, and it would land on the one input a type cannot warn
 * about, so the value has to reach that reader untouched.
 */
const providerOutputValue = z.custom<unknown>(() => true);

const providerTextPartSchema = z.object({ text: z.string() });

/**
 * `callId`, then `call_id`, then `id`. Each is a string or it is not there:
 * a number or an object in that position is an id this code cannot use, and
 * coercing it produced `'[object Object]'`, which matches nothing and says so
 * nowhere.
 */
const providerCallIdentity = {
	callId: z.string().optional(),
	call_id: z.string().optional(),
	id: z.string().optional()
};

const providerRawItemSchema = z.object({
	name: z.string().optional(),
	arguments: z.string().optional(),
	output: providerOutputValue.optional(),
	rawContent: z.array(providerTextPartSchema).optional(),
	content: z.array(providerTextPartSchema).optional(),
	summary: z.array(providerTextPartSchema).optional(),
	...providerCallIdentity
});

/**
 * The stream item, read off its declared fields.
 *
 * `z.object` strips what it does not name rather than rejecting it: providers
 * and the SDK both add fields, and the closed thing here is the arm set, not the
 * field set. `rawItem` is a declared property on every `RunItem` subclass and
 * `toJSON()` returns that same `rawItem`, so the serialised path the old reader
 * kept beside it was reading one field twice — and reading it meant calling a
 * method on a value nothing had parsed.
 */
const providerItemSchema = z.object({
	rawItem: providerRawItemSchema.optional(),
	toolName: z.string().optional(),
	callId: z.string().optional(),
	arguments: z.string().optional(),
	output: providerOutputValue.optional()
});

type ProviderItem = z.infer<typeof providerItemSchema>;

const runItemStreamEventSchema = z.object({
	type: z.literal('run_item_stream_event'),
	name: z.string(),
	item: providerItemSchema
});

/** The OpenRouter chunk that carries token-level reasoning beside the visible text. */
const providerReasoningChunkSchema = z.object({
	choices: z
		.array(z.object({ delta: z.object({ reasoning: z.string().nullish() }).optional() }))
		.optional()
});

const rawModelStreamEventSchema = z.object({
	type: z.literal('raw_model_stream_event'),
	data: z.union([
		z.object({ type: z.literal('output_text_delta'), delta: z.string() }),
		z.object({ type: z.literal('model'), event: providerReasoningChunkSchema })
	])
});

// audit-allow: no-unknown-type — A tool result straight off the provider SDK, classified rather than trusted.
const providerToolOutput = (value: unknown): ProviderToolOutput => {
	if (value === undefined || value === null) return { kind: 'none' };
	const read = readAgentPayload(value);
	return read.kind === 'valid'
		? { kind: 'value', value: read.value }
		: { kind: 'corrupt', message: read.message };
};

/**
 * Tool arguments, whether the provider sent them as JSON text or as an object.
 *
 * Both failures are fatal to the turn and always have been: a call whose
 * arguments nobody can read is a call that must not be presented as though it
 * ran.
 */
// audit-allow: no-unknown-type — The arguments the model produced, before readAgentPayload classifies them.
const providerArguments = (value: unknown): AgentPayloadObject => {
	if (value === undefined) return {};
	let candidate: unknown = value;
	if (typeof value === 'string') {
		try {
			candidate = JSON.parse(value);
		} catch (error) {
			throw new AgentProviderFailure(
				'The provider returned malformed JSON tool arguments',
				'MALFORMED_TOOL_ARGUMENTS',
				false,
				{ cause: error }
			);
		}
	}
	const read = readAgentPayloadObject(candidate);
	if (read.kind === 'corrupt')
		throw new AgentProviderFailure(
			'The provider returned tool arguments that were not an object',
			'MALFORMED_TOOL_ARGUMENTS',
			false,
			{ cause: new Error(read.message) }
		);
	return read.value;
};

const dispatchedCall = (
	name: string,
	args: AgentPayloadObject
): { readonly name: string; readonly arguments: AgentPayloadObject } | undefined => {
	if (name !== 'use_tool') return undefined;
	const inner = args.name;
	if (typeof inner !== 'string') return undefined;
	const payload = args.payload;
	return {
		name: inner,
		arguments: payload === undefined ? {} : providerArguments(payload)
	};
};

/**
 * The tool a legacy `use_tool` envelope dispatches to, or nothing when the call
 * is already a direct one.
 *
 * Conversations that predate the direct-dispatch surface still hold these
 * envelopes, and a tool discovered inside one has to stay callable in later
 * turns or the model reads its own transcript, repeats a call that worked a
 * message ago, and gets `Tool not found`.
 */
export const unwrapDispatchedToolCall = (
	name: string,
	args: string | undefined
): { readonly name: string; readonly arguments: AgentPayloadObject } | undefined =>
	dispatchedCall(name, providerArguments(args));

const providerReasoningText = (item: ProviderItem): string => {
	const raw = item.rawItem;
	const parts = raw?.rawContent ?? raw?.content ?? raw?.summary;
	if (!parts) return '';
	return parts
		.map((part) => part.text)
		.filter((text) => text.length > 0)
		.join('\n');
};

const providerCall = (item: ProviderItem): ProviderToolCall => {
	const raw = item.rawItem;
	const name = item.toolName ?? raw?.name ?? 'tool';
	const args = providerArguments(item.arguments ?? raw?.arguments);
	const dispatched = dispatchedCall(name, args);
	return {
		callId: item.callId ?? raw?.callId ?? raw?.call_id ?? raw?.id,
		name: dispatched?.name ?? name,
		arguments: dispatched?.arguments ?? args,
		output: providerToolOutput(item.output ?? raw?.output)
	};
};

/**
 * One stream event as an arm of {@link ProviderStreamEvent}.
 *
 * Raises only for arguments nobody can read; anything this union does not model
 * settles as `ignored`, so a newer SDK event type cannot fail a turn.
 */
// audit-allow: no-unknown-type — The provider stream item; this is the run loop single parse point.
export const parseProviderStreamEvent = (event: unknown): ProviderStreamEvent => {
	const runItem = runItemStreamEventSchema.safeParse(event);
	if (runItem.success) {
		const { name, item } = runItem.data;
		if (name === 'tool_called') return { type: 'tool_called', call: providerCall(item) };
		if (name === 'tool_output') return { type: 'tool_output', call: providerCall(item) };
		if (name !== 'reasoning_item_created') return { type: 'ignored' };
		const text = providerReasoningText(item);
		return text ? { type: 'reasoning_item', text } : { type: 'ignored' };
	}
	const raw = rawModelStreamEventSchema.safeParse(event);
	if (!raw.success) return { type: 'ignored' };
	const { data } = raw.data;
	if (data.type === 'output_text_delta') return { type: 'text_delta', text: data.delta };
	const reasoning = data.event.choices?.[0]?.delta?.reasoning;
	return reasoning ? { type: 'reasoning_delta', text: reasoning } : { type: 'ignored' };
};

/**
 * A tool call held outside the stream — a `RunState` interruption parked on an
 * approval, which is not a stream event and never reaches the loop above.
 *
 * Absent when the value is not a tool item at all. The caller decides what that
 * means: for an approval it means a parked call nothing can be matched against,
 * which is a failure rather than a call to skip.
 */
// audit-allow: no-unknown-type — The same provider item, read for the call it names.
export const parseProviderToolCall = (item: unknown): ProviderToolCall | undefined => {
	const parsed = providerItemSchema.safeParse(item);
	return parsed.success ? providerCall(parsed.data) : undefined;
};

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

// audit-allow: no-unknown-type — The stored run context snapshot, versioned at the repository and parsed here.
export const parseAgentRunContextSnapshot = (value: unknown): AgentRunContext | undefined => {
	if (emptyContextSchema.safeParse(value).success) return undefined;
	return agentRunContextSchema.parse(value);
};

// audit-allow: no-unknown-type — The stored workflow context, at the same repository boundary.
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
	// audit-allow: no-unknown-type — The remote input; catalog section 1 names this function as the exemplar.
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

const preferenceEdit = <K extends string, V>(
	key: K,
	value: V | null | undefined
): Partial<Record<K, V | undefined>> => {
	if (value === undefined) return {};
	const result: Partial<Record<K, V | undefined>> = {};
	result[key] = value === null ? undefined : value;
	return result;
};

/** Apply omitted, cleared, and explicit preferences identically on the device and server. */
export const applyAgentPreferenceUpdate = (
	current: AgentPreferences,
	input: UpdateAgentPreferencesInput
): AgentPreferences => ({
	...current,
	...preferenceEdit('defaultModel', input.defaultModel),
	...preferenceEdit('defaultVisionModel', input.defaultVisionModel),
	...preferenceEdit('inlineModel', input.inlineModel),
	...preferenceEdit('attachmentVisionModel', input.attachmentVisionModel),
	...preferenceEdit('webSearchEngine', input.webSearchEngine),
	...preferenceEdit('webSearchMaxResults', input.webSearchMaxResults),
	...preferenceEdit('webSearchMaxTotalResults', input.webSearchMaxTotalResults),
	...preferenceEdit('agentMaxTurns', input.agentMaxTurns),
	...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
	...(input.inlineSuggestionsEnabled !== undefined
		? { inlineSuggestionsEnabled: input.inlineSuggestionsEnabled }
		: {})
});
