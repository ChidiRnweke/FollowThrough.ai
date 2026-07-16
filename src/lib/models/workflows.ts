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
	NoteId,
	ProjectId,
	PromiseStrength,
	RelationshipKind,
	SourceAnchorId,
	SuggestionId,
	TextSelection,
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
export interface PromoteDiagramInput {
	readonly diagramId: DiagramId;
}
export interface PromoteDiagramOutput {
	readonly source: MermaidDiagram;
	readonly promoted: DrawioDiagram;
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
	readonly shareWithAgents?: boolean;
}
export interface UpdateMemoryEntryInput {
	readonly memoryEntryId: MemoryEntryId;
	readonly content?: string;
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
}
export type AgentEvent =
	| { readonly type: 'run_started'; readonly runId: AgentRunId }
	| { readonly type: 'text_delta'; readonly text: string }
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

export interface UpdateAgentPreferencesInput {
	readonly defaultModel?: string | null;
	readonly executionMode: import('./domain').AgentExecutionMode;
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
	readonly repairedAnchorIds: readonly SourceAnchorId[];
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
