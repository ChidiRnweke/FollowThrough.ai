type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

export type NoteId = Brand<string, 'NoteId'>;

export type NoteEtag = Brand<string, 'NoteEtag'>;

export type NoteRevisionId = Brand<string, 'NoteRevisionId'>;

type TodoId = Brand<string, 'TodoId'>;

type RelationshipId = Brand<string, 'RelationshipId'>;

type ReferenceId = Brand<string, 'ReferenceId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

export interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

export interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

export type NoteKind = 'folder' | 'note' | 'skill';

type TodoStatus = 'backlog' | 'open' | 'in_progress' | 'done' | 'cancelled';

type TodoResponsibility = 'mine' | 'waiting_on';

type TodoPriority = 'low' | 'medium' | 'high';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

type ProducerKind = 'user' | 'pipeline' | 'agent';

type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

/** A ProseMirror document plus a revision counter, the only concurrency token the sync protocol needs. */
export interface Note {
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

export type NoteSummary = Pick<
	Note,
	| 'id'
	| 'projectId'
	| 'parentId'
	| 'kind'
	| 'position'
	| 'title'
	| 'isPinned'
	| 'archivedAt'
	| 'createdAt'
	| 'updatedAt'
	| 'currentRevision'
>;

/** A published snapshot. History is append-only: `restoreVersion`-style operations copy a snapshot forward as a new current revision rather than rewinding. */
export interface NoteRevision {
	readonly id: NoteRevisionId;
	readonly noteId: NoteId;
	readonly revision: number;
	readonly title: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

interface SourceAnchor {
	readonly id: SourceAnchorId;
	readonly noteId: NoteId;
	readonly nodeId?: string;
	readonly from?: number;
	readonly to?: number;
	readonly quote: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly revision: number;
	readonly createdAt: DateTime;
}

interface Provenance {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly producerKind: ProducerKind;
	readonly producerName: string;
	readonly pipeline?: PipelineKind;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly runId?: AgentRunId;
	readonly model?: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
}

interface Todo {
	readonly id: TodoId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly status: TodoStatus;
	readonly responsibility: TodoResponsibility;
	readonly priority?: TodoPriority;
	readonly category?: string;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly linkedNoteId?: NoteId;
	readonly provenanceId?: ProvenanceId;
	readonly completedAt?: DateTime;
	readonly deletedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface NoteRelationship {
	readonly id: RelationshipId;
	readonly userId: UserId;
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface ExternalReference {
	readonly id: ReferenceId;
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

interface DiagramBase {
	readonly id: DiagramId;
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly title?: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface MermaidDiagram extends DiagramBase {
	readonly kind: 'mermaid';
	readonly source: string;
}

interface DrawioDiagram extends DiagramBase {
	readonly kind: 'drawio';
	readonly source: string;
	readonly promotedFromId?: DiagramId;
}

type Diagram = MermaidDiagram | DrawioDiagram;

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

/** A note paired with the ETag a save must present to land without conflict. */
export interface VersionedNote {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export interface SyncNoteInput {
	readonly note: Note;
	readonly baseEtag: NoteEtag;
	readonly operationId: string;
}

/** `conflict` only fires on genuine divergence: a stale ETag whose remote content matches the submission resolves to `saved` instead, so a retried save never reports a false conflict. */
export type SyncNoteOutput =
	| {
			readonly outcome: 'saved';
			readonly version: VersionedNote;
			readonly repairedAnchorIds: readonly SourceAnchorId[];
	  }
	| {
			readonly outcome: 'conflict';
			readonly baseEtag: NoteEtag;
			readonly remote: VersionedNote;
	  };

export interface NoteSyncInventoryEntry {
	readonly noteId: NoteId;
	readonly projectId: ProjectId;
	readonly etag: NoteEtag;
	readonly updatedAt: DateTime;
}

export interface ListNoteSyncInventoryInput {
	readonly projectId?: ProjectId;
}

export interface ListNoteSyncInventoryOutput {
	readonly entries: readonly NoteSyncInventoryEntry[];
}

export type NoteSyncRecordState = 'synced' | 'pending' | 'syncing' | 'conflict';

/** The offline client's three-way state for one note: the last agreed version, the device copy, and an optional diverged remote copy. */
export interface NoteSyncRecord {
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly base: VersionedNote;
	readonly local: Note;
	readonly remote?: VersionedNote;
	readonly operationId: string;
	readonly editVersion: number;
	readonly state: NoteSyncRecordState;
	readonly updatedAt: DateTime;
}

export type NoteSyncStatus = 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';

export const noteEtag = (note: Pick<Note, 'id' | 'currentRevision'>): NoteEtag =>
	`note:${note.id}:r${note.currentRevision}` as NoteEtag;

export const noteMatchesEtag = (
	note: Pick<Note, 'id' | 'currentRevision'>,
	etag: NoteEtag
): boolean => noteEtag(note) === etag;

export const noteSyncContentEquals = (left: Note, right: Note): boolean =>
	left.title === right.title &&
	left.plainText === right.plainText &&
	left.isPinned === right.isPinned &&
	JSON.stringify(left.document) === JSON.stringify(right.document);

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

export type NoteRef = Pick<Note, 'id' | 'title'>;

interface TodoView {
	readonly todo: Todo;
	readonly sourceNote?: NoteRef;
	readonly originNote?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance?: Provenance;
}

interface SuggestionView {
	readonly suggestion: Suggestion;
	readonly note?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly provenance: Provenance;
}

interface BacklinkView {
	readonly relationship: NoteRelationship;
	readonly sourceNote: NoteRef;
	readonly targetNote: NoteRef;
}

interface ReferenceView {
	readonly reference: ExternalReference;
	readonly anchor?: SourceAnchor;
}

/** Everything the editor renders for one note, assembled from parallel reads: the note itself plus its backlinks, references, diagrams, todos, and pending suggestions. */
export interface NoteView {
	readonly note: Note;
	readonly etag: NoteEtag;
	readonly backlinks: readonly BacklinkView[];
	readonly references: readonly ReferenceView[];
	readonly diagrams: readonly Diagram[];
	readonly todos: readonly TodoView[];
	readonly pendingSuggestions: readonly SuggestionView[];
}

export interface GetNoteViewInput {
	readonly noteId: NoteId;
}

/**
 * Just enough of a note to render it: the bodies an export needs, without the backlinks,
 * references, todos and suggestions that {@link NoteView} assembles.
 */
export interface NoteDocument {
	readonly id: NoteId;
	readonly title: string;
	readonly document: ProseMirrorDocument;
}

export interface ListNoteDocumentsInput {
	readonly noteIds: readonly NoteId[];
}

/** Upper bound on one batch, matching the export bundle's own cap. */
export const MAX_NOTE_DOCUMENTS = 50;

export interface CreateNoteInput {
	readonly projectId?: ProjectId;
	readonly title: string;
	readonly parentId?: NoteId;
}

export interface CreateNoteOutput {
	readonly note: Note;
}

export interface RenameNoteInput {
	readonly noteId: NoteId;
	readonly title: string;
}

export interface RenameNoteOutput {
	readonly note: Note;
}

export interface ArchiveNoteInput {
	readonly noteId: NoteId;
}

export interface ArchiveNoteOutput {
	readonly note: Note;
}

export interface RestoreNoteInput {
	readonly noteId: NoteId;
}

export interface RestoreNoteOutput {
	readonly note: Note;
}

export interface ListNoteTrashInput {
	readonly projectId?: ProjectId;
}

/** A note in the trash. `archivedAt` is what put it there, so unlike on {@link NoteSummary} it is always present. */
export interface TrashedNote extends Omit<NoteSummary, 'archivedAt'> {
	readonly archivedAt: DateTime;
	/** Carried so the global trash page can name each note's project without a second read. */
	readonly projectName: string;
}

export interface ListNoteTrashOutput {
	readonly notes: readonly TrashedNote[];
}

/**
 * How many published snapshots a note keeps. Beyond this the oldest are pruned, so
 * history costs a bounded amount per note however long it lives.
 */
export const NOTE_REVISION_HISTORY_LIMIT = 20;

export interface ListNoteRevisionsInput {
	readonly noteId: NoteId;
}

/**
 * One entry in the history list. Deliberately without the document: twenty snapshots of a
 * long note is a lot of payload to render a sidebar, so bodies are fetched one at a time
 * through {@link GetNoteRevisionInput} as the reader selects them.
 */
export interface NoteRevisionSummary {
	readonly id: NoteRevisionId;
	readonly revision: number;
	readonly title: string;
	readonly createdAt: DateTime;
	/** True for the snapshot the note's `publishedRevision` currently points at. */
	readonly isPublished: boolean;
}

export interface ListNoteRevisionsOutput {
	readonly revisions: readonly NoteRevisionSummary[];
}

export interface GetNoteRevisionInput {
	readonly noteId: NoteId;
	readonly revisionId: NoteRevisionId;
}

export interface GetNoteRevisionOutput {
	readonly revision: NoteRevision;
}

export interface RestoreNoteRevisionInput {
	readonly noteId: NoteId;
	readonly revisionId: NoteRevisionId;
}

export interface RestoreNoteRevisionOutput {
	readonly note: Note;
	readonly etag: NoteEtag;
}

export * from './prosemirror';

export * from './note-patch';

export * from './note-links';
