import type {
	Diagram,
	DrawioDiagram,
	ExternalReference,
	MemoryChangeOperation,
	MemoryEntry,
	MemoryScope,
	MermaidDiagram,
	Note,
	NoteRelationship,
	Skill,
	Suggestion,
	Todo
} from './domain';
import type {
	ConversationId,
	AgentRunId,
	DiagramId,
	LocalDate,
	MemoryEntryId,
	MemoryEntryType,
	NoteId,
	ProjectId,
	PromiseStrength,
	RelationshipKind,
	SourceAnchorId,
	SuggestionId,
	TextSelection,
	NoteEtag,
	TodoResponsibility,
	Url
} from './shared';

export interface PromiseCandidate {
	readonly action: string;
	readonly ownerName?: string;
	readonly responsibility: TodoResponsibility;
	readonly dueDateVerbatim?: string;
	readonly resolvedDueDate?: LocalDate;
	readonly strength: PromiseStrength;
	readonly confidence: number;
}

export interface LinkCandidate {
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}

export interface ReferenceCandidate {
	readonly url: Url;
	readonly title: string;
	readonly tier: 'official' | 'standard' | 'vendor' | 'community';
	readonly relevanceNote: string;
	readonly confidence: number;
}

export interface ExtractPromisesInput {
	readonly selection: TextSelection;
}
export interface ExtractPromisesOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Suggestion[];
	readonly createdTodos: readonly Todo[];
}

export interface RelateSelectionInput {
	readonly selection: TextSelection;
}
export interface RelateSelectionOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Suggestion[];
}

export interface FindReferencesInput {
	readonly selection: TextSelection;
}
export type FindReferencesOutput =
	| {
			readonly outcome: 'found';
			readonly anchorId: SourceAnchorId;
			readonly suggestions: readonly Suggestion[];
	  }
	| { readonly outcome: 'nothing_relevant'; readonly anchorId: SourceAnchorId };

export interface GenerateMermaidDiagramInput {
	readonly selection: TextSelection;
	readonly instruction?: string;
}
export interface GenerateMermaidDiagramOutput {
	readonly anchorId: SourceAnchorId;
	readonly suggestion: Suggestion;
}

export interface ReviseMermaidDiagramInput {
	readonly diagramId: DiagramId;
	readonly instruction: string;
}
export interface ReviseMermaidDiagramOutput {
	readonly diagram: MermaidDiagram;
}
export interface ReviseInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction: string;
}
export interface ReviseInlineMermaidOutput {
	readonly source: string;
	readonly title?: string;
}
export interface ConvertInlineMermaidInput {
	readonly noteId: NoteId;
	readonly source: string;
	readonly instruction?: string;
}
export interface ConvertInlineMermaidOutput {
	readonly suggestion: Suggestion;
}
export interface GetDrawioDiagramInput {
	readonly noteId: NoteId;
	readonly diagramId: DiagramId;
}
export interface SaveDrawioDiagramInput extends GetDrawioDiagramInput {
	readonly source: string;
	readonly renderedSvg: string;
}
export interface SaveDrawioDiagramOutput {
	readonly diagram: DrawioDiagram;
}
export interface PromoteDiagramInput {
	readonly diagramId: DiagramId;
}
export interface PromoteDiagramOutput {
	readonly source: MermaidDiagram;
	readonly suggestion: Suggestion;
}

export interface AcceptSuggestionInput {
	readonly suggestionId: SuggestionId;
	readonly autoAccepted?: boolean;
}
export interface AcceptSuggestionOutput {
	readonly suggestion: Suggestion;
	readonly artifact: Todo | NoteRelationship | ExternalReference | Diagram | MemoryEntry;
}
export interface RejectSuggestionInput {
	readonly suggestionId: SuggestionId;
}
export interface RevertSuggestionInput {
	readonly suggestionId: SuggestionId;
}

export interface ListMemoryInput {
	/** Omit projectId to list the user's profile memory. */
	readonly projectId?: ProjectId;
	readonly sharedOnly?: boolean;
}
export interface ListMemoryOutput {
	readonly entries: readonly MemoryEntry[];
}
export interface CreateMemoryEntryInput {
	/** Omit projectId to create a user-profile entry. */
	readonly projectId?: ProjectId;
	readonly content: string;
	readonly type?: MemoryEntryType;
	readonly shareWithAgents?: boolean;
}
export interface UpdateMemoryEntryInput {
	readonly memoryEntryId: MemoryEntryId;
	readonly content?: string;
	readonly type?: MemoryEntryType | null;
	readonly shareWithAgents?: boolean;
}
export interface DeleteMemoryEntryInput {
	readonly memoryEntryId: MemoryEntryId;
}
export interface ProposeMemoryChangeInput {
	readonly scope: MemoryScope;
	readonly projectId?: ProjectId;
	readonly operation: MemoryChangeOperation;
	readonly memoryEntryId?: MemoryEntryId;
	readonly content?: string;
	readonly shareWithAgents?: boolean;
	readonly justification?: string;
	readonly confidence?: number;
}
export interface ProposeMemoryChangeOutput {
	readonly suggestion: Suggestion;
	readonly appliedEntry?: MemoryEntry;
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
	readonly executionModeOverride?: import('./domain').AgentExecutionMode | null;
	readonly prompt: string;
	readonly appContext?: import('./app-context').AppContextSnapshotV1;
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
	readonly model?: string | null;
	readonly mode?: import('./domain').AgentExecutionMode | null;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly selection?: TextSelection;
	readonly contextNoteIds?: readonly NoteId[];
	readonly requestedSkillNames?: readonly string[];
	readonly requestedSkillNoteIds?: readonly NoteId[];
	readonly appContext?: import('./app-context').AppContextSnapshotV1;
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

/** A partial edit: omitted fields keep their stored value, `defaultModel: null` clears it. */
export interface UpdateAgentPreferencesInput {
	readonly defaultModel?: string | null;
	readonly executionMode?: import('./domain').AgentExecutionMode;
	readonly inlineSuggestionsEnabled?: boolean;
}

export interface RestoreSkillVersionInput {
	readonly noteId: NoteId;
	readonly revision: number;
}

export interface LoadSkillInput {
	readonly noteId: NoteId;
	readonly contextNoteId?: NoteId;
	readonly provenanceId: import('./shared').ProvenanceId;
}

export interface SaveNoteInput {
	readonly note: Note;
}
export interface SaveNoteOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
	readonly repairedAnchorIds: readonly SourceAnchorId[];
}

export interface PublishNoteInput {
	readonly noteId: NoteId;
	readonly baseEtag: NoteEtag;
}
export interface PublishNoteOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface DiscardNoteDraftInput {
	readonly noteId: NoteId;
}
export interface DiscardNoteDraftOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface CreateSkillFromSelectionInput {
	readonly selection: TextSelection;
	readonly name: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
}
export interface CreateSkillFromSelectionOutput {
	readonly skillNoteId: NoteId;
}

export interface CreateSkillInput {
	readonly name: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	readonly projectId?: ProjectId;
	readonly parentId?: NoteId;
}
export interface CreateSkillOutput {
	readonly skill: Skill;
}
