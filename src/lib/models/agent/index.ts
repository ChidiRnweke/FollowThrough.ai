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
	readonly content?: readonly Record<string, unknown>[];
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

export interface TrustPolicy {
	readonly userId: UserId;
	readonly pipeline: PipelineKind;
	readonly autoAcceptEnabled: boolean;
	readonly minimumConfidence?: Confidence;
	readonly conditions: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

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

export interface ToolActivity {
	readonly callId: string;
	readonly name: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly output?: unknown;
	readonly failure?: string;
	readonly decision?: 'approved' | 'rejected';
	readonly status: 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';
}

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

export interface PendingAgentDecision {
	readonly callId: string;
	readonly toolName: string;
	readonly arguments: Readonly<Record<string, unknown>>;
}

export interface AgentRun {
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
	readonly pendingDecisions: readonly PendingAgentDecision[];
	readonly failure?: string;
	readonly providerErrorCode?: string;
	readonly contextSnapshot?: Readonly<Record<string, unknown>>;
	readonly inputSnapshot?: Readonly<Record<string, unknown>>;
	readonly retryOfRunId?: AgentRunId;
	readonly definitionVersion?: number;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface AgentRunReceipt {
	readonly runId: AgentRunId;
	readonly conversationId: ConversationId;
	readonly status: AgentRunStatus;
	readonly latestCursor: string;
}

export interface AgentRunSnapshot {
	readonly run: AgentRun;
	readonly latestCursor: string;
	readonly pendingDecisions: readonly PendingAgentDecision[];
}

export interface AgentSessionItem {
	readonly id: AgentSessionItemId;
	readonly conversationId: ConversationId;
	readonly position: number;
	readonly item: Readonly<Record<string, unknown>>;
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

export interface RunAgentInput {
	readonly requestId?: string;
	readonly conversationId?: ConversationId;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly selection?: TextSelection;
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly modelOverride?: string | null;
	readonly visionModelOverride?: string | null;
	readonly executionModeOverride?: AgentExecutionMode | null;
	/**
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

export interface SubmitAgentRunInput {
	readonly requestId: string;
	readonly conversationId?: ConversationId;
	readonly input: string;
	readonly images?: readonly ConversationImageInput[];
	readonly model?: string | null;
	readonly visionModel?: string | null;
	readonly mode?: AgentExecutionMode | null;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly selection?: TextSelection;
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

interface AppContextSnapshotV1 {
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
	};
	readonly selection?: TextSelection;
	readonly recentInteractions: readonly SemanticInteraction[];
}

export * from './agent-runs';
