import type { SuggestionView } from '$lib/models/suggestions';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

export type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

type TodoResponsibility = 'mine' | 'waiting_on';

export type MemoryEntryType = 'fact' | 'decision' | 'constraint' | 'preference';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

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

export type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;

type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

/**
 * A durable remembered fact. Entries with a project hold project memory; entries
 * without one form the user's profile memory — who they are across all projects.
 */
export interface MemoryEntry {
	readonly id: MemoryEntryId;
	readonly userId: UserId;
	readonly projectId?: ProjectId;
	readonly content: string;
	readonly type?: MemoryEntryType;
	readonly shareWithAgents: boolean;
	readonly provenanceId?: ProvenanceId;
	readonly replacesEntryId?: MemoryEntryId;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export type MemoryChangeOperation = 'add' | 'update' | 'remove';

export type MemoryScope = 'project' | 'user';

export interface MemoryChangePayload {
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

/** `appliedEntry` is present only when the trust policy auto-accepted the change; otherwise the suggestion alone is returned, pending review. */
export interface ProposeMemoryChangeOutput {
	readonly suggestion: Suggestion;
	readonly appliedEntry?: MemoryEntry;
}

export interface MemorySuggestionView extends Omit<SuggestionView, 'suggestion'> {
	readonly suggestion: MemorySuggestion;
}

/** One row in the bell menu: a project's pending-review count, or the single profile-memory row when `projectId` is absent. */
export interface PendingMemoryNotification {
	readonly projectId?: ProjectId;
	readonly label: string;
	readonly href: string;
	readonly count: number;
}

export interface ListPendingMemoryInput {
	readonly projectId?: ProjectId;
}

export interface ListPendingMemoryOutput {
	readonly suggestions: readonly MemorySuggestionView[];
}
