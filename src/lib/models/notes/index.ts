type Brand<T, Name extends string> = T & { readonly __brand: Name };

import type { SuggestionView } from '$lib/models/suggestions';
import type { Provenance } from '$lib/models/provenance';
import { z } from 'zod';
import type { NoteRevisionDiff } from './revision-diff';
import type { SectionNumberingView } from './section-numbering';

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type ConversationId = Brand<string, 'ConversationId'>;

export type NoteId = Brand<string, 'NoteId'>;

export type NoteEtag = Brand<string, 'NoteEtag'>;

export type NoteRevisionId = Brand<string, 'NoteRevisionId'>;

type TodoId = Brand<string, 'TodoId'>;

type RelationshipId = Brand<string, 'RelationshipId'>;

type ReferenceId = Brand<string, 'ReferenceId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

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

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

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
	/**
	 * The note's own section-numbering choice; absent inherits the project default.
	 * Carried on reads but deliberately never written by {@link SaveNoteInput} — it
	 * changes through `setSectionNumbering`, outside the sync protocol, the same way
	 * `parentId` and `position` do.
	 */
	readonly sectionNumbering?: boolean;
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
	/** Diagrams are owned by their project; a source note is optional context. */
	readonly projectId: ProjectId;
	/** Absent for a studio diagram, which belongs to the project rather than a note. */
	readonly sourceNoteId?: NoteId;
	/** The studio conversation that produced this diagram, for reopening it. */
	readonly conversationId?: ConversationId;
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
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly publishedAt?: DateTime;
	readonly promotedFromId?: DiagramId;
}

type Diagram = MermaidDiagram | DrawioDiagram;

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

export interface SetNoteSectionNumberingInput {
	readonly noteId: NoteId;
	/** `undefined` clears the note's override so it inherits the project default again. */
	readonly enabled?: boolean;
}

export interface SetNoteSectionNumberingOutput {
	readonly sectionNumbering: SectionNumberingView;
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
	/** The note's section-numbering cascade, resolved by the controller across note, project and app. */
	readonly sectionNumbering: SectionNumberingView;
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
	/**
	 * Required, because there is no honest way to fill it in. It was optional, and
	 * a note created without one landed in whichever project sorted first — or in a
	 * project brought into existence to receive it. Neither is a choice anyone
	 * made, and both look like success.
	 */
	readonly projectId: ProjectId;
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

export interface DeleteNoteForeverInput {
	readonly noteId: NoteId;
}

/**
 * The ids that were actually destroyed. A folder takes the trashed notes inside it with
 * it, so this is not always the single id that was asked for.
 */
export interface DeleteNoteForeverOutput {
	readonly deletedNoteIds: readonly NoteId[];
}

export interface EmptyNoteTrashInput {
	readonly projectId?: ProjectId;
}

export interface EmptyNoteTrashOutput {
	readonly deletedNoteIds: readonly NoteId[];
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

export interface ReadNoteRevisionInput {
	readonly noteId: NoteId;
	readonly revisionId: NoteRevisionId;
}

/**
 * One revision's plain text. Deliberately without the ProseMirror document;
 * agent reads mount the Markdown revision in the virtual file tree.
 */
export interface ReadNoteRevisionOutput {
	readonly revision: number;
	readonly title: string;
	readonly plainText: string;
	readonly createdAt: DateTime;
	/** True when this snapshot is the note's current published revision. */
	readonly isPublished: boolean;
}

export interface CompareNoteRevisionsInput {
	readonly noteId: NoteId;
	readonly revisionId: NoteRevisionId;
	/** Baseline for the diff; defaults to the note's current published revision. */
	readonly againstRevisionId?: NoteRevisionId;
}

export interface CompareNoteRevisionsOutput {
	readonly diff: NoteRevisionDiff;
	/** The revision number the target was diffed against, resolved server-side. */
	readonly againstRevision: number;
}

/**
 * The note document tree as a strict discriminated union over the editor's real
 * node and mark set.
 *
 * The source of truth for the set is the headless schema list in
 * `src/lib/components/edra/commands/markdown-extensions.ts` — a node or mark the
 * editor can serialize has a member here, and anything else fails to parse
 * (ADR 0037, ADR 0015). `mediaPlaceholder` is deliberately absent: it represents
 * an upload still in flight and never reaches a stored document.
 *
 * **Node and mark types are closed; attributes are open.** An unmodelled node type
 * changes what the document renders as and has to be caught. An unmodelled
 * attribute does not: Tiptap extensions add global attributes to nodes they do
 * not own — `addGlobalAttributes` is the documented mechanism — so the attribute
 * set is open by construction and grows with every extension. Rejecting unknown
 * attribute keys made the schema a list of every extension ever configured, which
 * it silently stopped being the moment one was added.
 *
 * An earlier version of this comment claimed "attribute keys are optional while
 * their value types are strict: the editor serializes every default". The first
 * half is right and the second half inverted it. `Node.toJSON()` serializes a
 * default by *writing it*, so a default of `null` reaches storage as
 * `textAlign: null` — 659 of 663 stored values — which an `.optional()` enum
 * rejects. Defaults are present-and-null, not absent.
 *
 * The types below name only the attributes this code reads; the schemas preserve
 * every other key verbatim so a round trip is lossless. That asymmetry is
 * deliberate. An index signature on the types would make `node.attrs.anything`
 * type-check, which is the open-record indexing ADR 0037 exists to remove.
 *
 * This union lives in the notes domain barrel. Sibling model helpers such as
 * `text-search.ts` keep minimal structural views rather than importing the barrel.
 */

export type ProseMirrorTextAlign = 'left' | 'center' | 'right' | 'justify';

/** Whatever JSON an extension chose to store in an attribute. */
export type ProseMirrorAttrValue =
	| string
	| number
	| boolean
	| null
	| readonly ProseMirrorAttrValue[]
	| { readonly [key: string]: ProseMirrorAttrValue };

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export interface ProseMirrorLinkAttrs {
	readonly href?: string | null;
	readonly target?: string | null;
	readonly rel?: string | null;
	readonly class?: string | null;
	readonly title?: string | null;
}

export interface ProseMirrorNoteLinkAttrs {
	readonly noteId?: string | null;
}

export interface ProseMirrorHighlightAttrs {
	readonly color?: string | null;
}

/** The `textStyle` mark carries what the Color and FontSize extensions hang on it. */
export interface ProseMirrorTextStyleAttrs {
	readonly color?: string | null;
	readonly fontSize?: string | null;
}

export interface ProseMirrorAiHighlightAttrs {
	readonly color?: string | null;
}

export type ProseMirrorMark =
	| { readonly type: 'bold' }
	| { readonly type: 'italic' }
	| { readonly type: 'strike' }
	| { readonly type: 'code' }
	| { readonly type: 'underline' }
	| { readonly type: 'subscript' }
	| { readonly type: 'superscript' }
	| { readonly type: 'link'; readonly attrs?: ProseMirrorLinkAttrs }
	| { readonly type: 'noteLink'; readonly attrs?: ProseMirrorNoteLinkAttrs }
	| { readonly type: 'highlight'; readonly attrs?: ProseMirrorHighlightAttrs }
	| { readonly type: 'textStyle'; readonly attrs?: ProseMirrorTextStyleAttrs }
	| { readonly type: 'ai-highlight'; readonly attrs?: ProseMirrorAiHighlightAttrs };

// ---------------------------------------------------------------------------
// Node attributes
// ---------------------------------------------------------------------------

export interface ProseMirrorMediaAttrs {
	readonly src?: string | null;
	readonly alt?: string | null;
	readonly title?: string | null;
	readonly width?: string | number | null;
	readonly height?: string | number | null;
	readonly align?: string | null;
}

export interface ProseMirrorAudioAttrs {
	readonly src?: string | null;
	readonly controls?: boolean | null;
	readonly autoplay?: boolean | null;
	readonly loop?: boolean | null;
	readonly muted?: boolean | null;
	readonly preload?: string | null;
	readonly controlslist?: string | null;
	readonly crossorigin?: string | null;
	readonly disableremoteplayback?: boolean | null;
}

export interface ProseMirrorTableCellAttrs {
	readonly colspan?: number;
	readonly rowspan?: number;
	readonly colwidth?: readonly number[] | null;
	readonly style?: string | null;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface ProseMirrorTextNode {
	readonly type: 'text';
	readonly text: string;
	readonly marks?: readonly ProseMirrorMark[];
}

export interface ProseMirrorParagraphNode {
	readonly type: 'paragraph';
	readonly attrs?: { readonly textAlign?: ProseMirrorTextAlign | null };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorHeadingNode {
	readonly type: 'heading';
	readonly attrs?: {
		readonly level?: 1 | 2 | 3 | 4;
		readonly textAlign?: ProseMirrorTextAlign | null;
		/** Written by `@tiptap/extension-table-of-contents`; the outline and its anchors read both. */
		readonly id?: string | null;
		readonly 'data-toc-id'?: string | null;
	};
	readonly content?: readonly ProseMirrorNode[];
}

/**
 * A node this union does not recognise, kept whole.
 *
 * An arm rather than a thrown error, and an arm on the *node* rather than on the
 * document, because those two choices are what bound the damage. `toNote` maps
 * every row of a note list, so a throw from one document took out `/today`
 * entirely; an arm on `Note.document` would instead force every consumer of a
 * loaded note to branch on a case it cannot act on. At node granularity the
 * failure stays where it happened: one block renders as unreadable, the rest of
 * the note is fine, and the list never breaks.
 *
 * `raw` round-trips back to storage unchanged, so a document that degrades here
 * loses nothing and repairs itself once the missing arm is added.
 */
export interface ProseMirrorUnknownNode {
	readonly type: 'unknown';
	readonly raw: ProseMirrorAttrValue;
	/** Why it did not match, for the operator reading a log or the corpus test. */
	readonly reason: string;
}

export interface ProseMirrorBlockquoteNode {
	readonly type: 'blockquote';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorBulletListNode {
	readonly type: 'bulletList';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorOrderedListNode {
	readonly type: 'orderedList';
	readonly attrs?: { readonly start?: number; readonly type?: string | null };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorListItemNode {
	readonly type: 'listItem';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTaskListNode {
	readonly type: 'taskList';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTaskItemNode {
	readonly type: 'taskItem';
	readonly attrs?: { readonly checked?: boolean };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorCodeBlockNode {
	readonly type: 'codeBlock';
	readonly attrs?: { readonly language?: string | null };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTableNode {
	readonly type: 'table';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTableRowNode {
	readonly type: 'tableRow';
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTableCellNode {
	readonly type: 'tableCell';
	readonly attrs?: ProseMirrorTableCellAttrs;
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTableHeaderNode {
	readonly type: 'tableHeader';
	readonly attrs?: ProseMirrorTableCellAttrs;
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorHorizontalRuleNode {
	readonly type: 'horizontalRule';
}

export interface ProseMirrorHardBreakNode {
	readonly type: 'hardBreak';
	readonly marks?: readonly ProseMirrorMark[];
}

export interface ProseMirrorImageNode {
	readonly type: 'image';
	readonly attrs?: ProseMirrorMediaAttrs;
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorVideoNode {
	readonly type: 'video';
	readonly attrs?: ProseMirrorMediaAttrs;
}

export interface ProseMirrorAudioNode {
	readonly type: 'audio';
	readonly attrs?: ProseMirrorAudioAttrs;
	readonly marks?: readonly ProseMirrorMark[];
}

export interface ProseMirrorIframeNode {
	readonly type: 'iframe';
	readonly attrs?: {
		readonly src?: string;
		readonly width?: string;
		readonly height?: number;
	};
}

export interface ProseMirrorMermaidNode {
	readonly type: 'mermaid';
	readonly attrs?: {
		readonly width?: string;
		readonly pendingDrawioSuggestionId?: string | null;
	};
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorDrawioNode {
	readonly type: 'drawio';
	readonly attrs?: { readonly diagramId?: string | null };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorTodoNode {
	readonly type: 'todoNode';
	readonly attrs?: { readonly todoId?: string | null };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorCalloutNode {
	readonly type: 'callout';
	readonly attrs?: { readonly emoji?: string };
	readonly content?: readonly ProseMirrorNode[];
}

export interface ProseMirrorBlockMathNode {
	readonly type: 'blockMath';
	readonly attrs?: { readonly latex?: string };
}

export interface ProseMirrorInlineMathNode {
	readonly type: 'inlineMath';
	readonly attrs?: { readonly latex?: string };
	readonly marks?: readonly ProseMirrorMark[];
}

export type ProseMirrorNode =
	| ProseMirrorTextNode
	| ProseMirrorParagraphNode
	| ProseMirrorHeadingNode
	| ProseMirrorBlockquoteNode
	| ProseMirrorBulletListNode
	| ProseMirrorOrderedListNode
	| ProseMirrorListItemNode
	| ProseMirrorTaskListNode
	| ProseMirrorTaskItemNode
	| ProseMirrorCodeBlockNode
	| ProseMirrorTableNode
	| ProseMirrorTableRowNode
	| ProseMirrorTableCellNode
	| ProseMirrorTableHeaderNode
	| ProseMirrorHorizontalRuleNode
	| ProseMirrorHardBreakNode
	| ProseMirrorImageNode
	| ProseMirrorVideoNode
	| ProseMirrorAudioNode
	| ProseMirrorIframeNode
	| ProseMirrorMermaidNode
	| ProseMirrorDrawioNode
	| ProseMirrorTodoNode
	| ProseMirrorCalloutNode
	| ProseMirrorBlockMathNode
	| ProseMirrorInlineMathNode
	| ProseMirrorUnknownNode;

export interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly ProseMirrorNode[];
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * `null` is not a tolerated oddity here, it is the common case: Tiptap's
 * `TextAlign` extension defaults to `defaultAlignment: null` and this repo does
 * not override it, so every paragraph and heading the editor writes carries it.
 */
const textAlignSchema = z.enum(['left', 'center', 'right', 'justify']);

const attrValueSchema: z.ZodType<ProseMirrorAttrValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(attrValueSchema),
		z.record(z.string(), attrValueSchema)
	])
);

/**
 * Named attributes plus whatever else the extension wrote.
 *
 * `catchall` rather than `strict`: the named keys stay checked, and a key this
 * schema has never heard of is preserved instead of failing the node. That is
 * what makes adding a Tiptap extension a non-event rather than an outage.
 */
const attrs = <Shape extends z.ZodRawShape>(shape: Shape) =>
	z.object(shape).catchall(attrValueSchema);

const linkAttrsSchema = attrs({
	href: z.string().nullish(),
	target: z.string().nullish(),
	rel: z.string().nullish(),
	class: z.string().nullish(),
	title: z.string().nullish()
});

/**
 * `width` and `height` are a string or a number, because both are stored. The
 * resize handle writes a CSS string and the paste path writes the intrinsic
 * pixel count, and nothing has ever normalised between them.
 */
const mediaDimensionSchema = z.union([z.string(), z.number()]);

const mediaAttrsSchema = attrs({
	src: z.string().nullish(),
	alt: z.string().nullish(),
	title: z.string().nullish(),
	width: mediaDimensionSchema.nullish(),
	height: mediaDimensionSchema.nullish(),
	align: z.string().nullish()
});

const tableCellAttrsSchema = attrs({
	colspan: z.number().optional(),
	rowspan: z.number().optional(),
	colwidth: z.array(z.number()).nullish(),
	style: z.string().nullish()
});

export const proseMirrorMarkSchema: z.ZodType<ProseMirrorMark> = z.discriminatedUnion('type', [
	z.object({ type: z.literal('bold') }).strict(),
	z.object({ type: z.literal('italic') }).strict(),
	z.object({ type: z.literal('strike') }).strict(),
	z.object({ type: z.literal('code') }).strict(),
	z.object({ type: z.literal('underline') }).strict(),
	z.object({ type: z.literal('subscript') }).strict(),
	z.object({ type: z.literal('superscript') }).strict(),
	z.object({ type: z.literal('link'), attrs: linkAttrsSchema.optional() }).strict(),
	z
		.object({
			type: z.literal('noteLink'),
			attrs: attrs({ noteId: z.string().nullish() }).optional()
		})
		.strict(),
	z
		.object({
			type: z.literal('highlight'),
			attrs: attrs({ color: z.string().nullish() }).optional()
		})
		.strict(),
	z
		.object({
			type: z.literal('textStyle'),
			attrs: attrs({ color: z.string().nullish(), fontSize: z.string().nullish() }).optional()
		})
		.strict(),
	z
		.object({
			type: z.literal('ai-highlight'),
			attrs: attrs({ color: z.string().nullish() }).optional()
		})
		.strict()
]);

const nodeContent = () => z.array(z.lazy(() => proseMirrorNodeSchema)).optional();

const inlineMarks = () => z.array(z.lazy(() => proseMirrorMarkSchema)).optional();

const knownNodeSchema = z.lazy(() =>
	z.discriminatedUnion('type', [
		z.object({ type: z.literal('text'), text: z.string(), marks: inlineMarks() }).strict(),
		z
			.object({
				type: z.literal('paragraph'),
				attrs: attrs({ textAlign: textAlignSchema.nullish() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('heading'),
				attrs: attrs({
					level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
					textAlign: textAlignSchema.nullish(),
					id: z.string().nullish(),
					'data-toc-id': z.string().nullish()
				}).optional(),
				content: nodeContent()
			})
			.strict(),
		z.object({ type: z.literal('blockquote'), content: nodeContent() }).strict(),
		z.object({ type: z.literal('bulletList'), content: nodeContent() }).strict(),
		z
			.object({
				type: z.literal('orderedList'),
				attrs: attrs({ start: z.number().optional(), type: z.string().nullish() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z.object({ type: z.literal('listItem'), content: nodeContent() }).strict(),
		z.object({ type: z.literal('taskList'), content: nodeContent() }).strict(),
		z
			.object({
				type: z.literal('taskItem'),
				attrs: attrs({ checked: z.boolean().optional() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('codeBlock'),
				attrs: attrs({ language: z.string().nullish() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z.object({ type: z.literal('table'), content: nodeContent() }).strict(),
		z.object({ type: z.literal('tableRow'), content: nodeContent() }).strict(),
		z
			.object({
				type: z.literal('tableCell'),
				attrs: tableCellAttrsSchema.optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('tableHeader'),
				attrs: tableCellAttrsSchema.optional(),
				content: nodeContent()
			})
			.strict(),
		z.object({ type: z.literal('horizontalRule') }).strict(),
		z.object({ type: z.literal('hardBreak'), marks: inlineMarks() }).strict(),
		z
			.object({
				type: z.literal('image'),
				attrs: mediaAttrsSchema.optional(),
				content: nodeContent()
			})
			.strict(),
		z.object({ type: z.literal('video'), attrs: mediaAttrsSchema.optional() }).strict(),
		z
			.object({
				type: z.literal('audio'),
				attrs: attrs({
					src: z.string().nullish(),
					controls: z.boolean().nullish(),
					autoplay: z.boolean().nullish(),
					loop: z.boolean().nullish(),
					muted: z.boolean().nullish(),
					preload: z.string().nullish(),
					controlslist: z.string().nullish(),
					crossorigin: z.string().nullish(),
					disableremoteplayback: z.boolean().nullish()
				}).optional(),
				marks: inlineMarks()
			})
			.strict(),
		z
			.object({
				type: z.literal('iframe'),
				attrs: attrs({
					src: z.string().optional(),
					width: z.string().optional(),
					height: z.number().optional()
				}).optional()
			})
			.strict(),
		z
			.object({
				type: z.literal('mermaid'),
				attrs: attrs({
					width: z.string().optional(),
					pendingDrawioSuggestionId: z.string().nullish()
				}).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('drawio'),
				attrs: attrs({ diagramId: z.string().nullish() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('todoNode'),
				attrs: attrs({ todoId: z.string().nullish() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('callout'),
				attrs: attrs({ emoji: z.string().optional() }).optional(),
				content: nodeContent()
			})
			.strict(),
		z
			.object({
				type: z.literal('blockMath'),
				attrs: attrs({ latex: z.string().optional() }).optional()
			})
			.strict(),
		z
			.object({
				type: z.literal('inlineMath'),
				attrs: attrs({ latex: z.string().optional() }).optional(),
				marks: inlineMarks()
			})
			.strict()
	])
);

/**
 * Every node type the union above names, for telling "a type nobody modelled"
 * apart from "a type we model, shaped in a way we did not expect". Both degrade
 * to {@link ProseMirrorUnknownNode}; only the message differs, and the message
 * is the whole value of the arm to whoever has to fix it.
 */
const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set([
	'text',
	'paragraph',
	'heading',
	'blockquote',
	'bulletList',
	'orderedList',
	'listItem',
	'taskList',
	'taskItem',
	'codeBlock',
	'table',
	'tableRow',
	'tableCell',
	'tableHeader',
	'horizontalRule',
	'hardBreak',
	'image',
	'video',
	'audio',
	'iframe',
	'mermaid',
	'drawio',
	'todoNode',
	'callout',
	'blockMath',
	'inlineMath'
]);

/**
 * The fallback arm, tried only after every real arm has failed.
 *
 * It accepts any object carrying a string `type`, which is the least a
 * ProseMirror node can be, and keeps the whole thing — nested `content`
 * included — so the block round-trips back to storage untouched. Because the
 * union is tried innermost-first through `nodeContent`, a bad node degrades
 * itself and leaves its ancestors intact.
 */
const unknownNodeSchema = z
	.object({ type: z.string() })
	.catchall(attrValueSchema)
	.transform((raw) => ({
		type: 'unknown' as const,
		raw,
		reason: KNOWN_NODE_TYPES.has(raw.type)
			? `A '${raw.type}' node did not match its shape`
			: `No arm matches a node of type '${raw.type}'`
	}));

/**
 * The strict tree. Nested content is strict all the way down, and this is what
 * every *write* boundary uses.
 */
export const proseMirrorNodeSchema: z.ZodType<ProseMirrorNode> = knownNodeSchema;

export const proseMirrorDocumentSchema: z.ZodType<ProseMirrorDocument> = z
	.object({
		type: z.literal('doc'),
		content: z.array(proseMirrorNodeSchema).optional()
	})
	.strict();

/**
 * The read tree: strict, with a fallback at top level only.
 *
 * A block is the unit of degradation. Pushing the fallback all the way down
 * would need a second copy of the whole union — one strict tree and one
 * resilient tree — which is two schemas for one shape, the exact drift this
 * module exists to prevent. A top-level fallback needs no second copy and still
 * gives what the arm is for: a document with one unreadable block instead of a
 * list read that throws.
 */
const storedDocumentSchema: z.ZodType<ProseMirrorDocument> = z
	.object({
		type: z.literal('doc'),
		content: z.array(z.union([proseMirrorNodeSchema, unknownNodeSchema])).optional()
	})
	.strict();

/**
 * Parse a document at a *write* boundary. Throws a zod error naming the first bad
 * path.
 *
 * Strict at write, resilient at read (ADR 0037). A request body that does not
 * parse is input the caller can fix, so rejecting it loudly is the whole point.
 * Data already sitting in a column is not — see {@link readProseMirrorDocument}.
 */
// audit-allow: no-unknown-type — The strict write-side parse for a stored or imported document.
export const parseProseMirrorDocument = (value: unknown): ProseMirrorDocument =>
	proseMirrorDocumentSchema.parse(value);

/**
 * Read a document out of storage. Total: it never throws.
 *
 * Individual nodes already degrade to {@link ProseMirrorUnknownNode} on their
 * own, so this only catches a column that is not a `doc` at all — genuine
 * corruption. Even then it answers with a document, because the caller is a
 * mapper inside a list: `toNote` runs over every row of `listActive`, and a
 * throw from one row is what took `/today` down. A reported failure the renderer
 * shows beats an exception the page cannot survive (ADR 0015).
 */
// audit-allow: no-unknown-type — The total read the DB mappers use for a stored document.
export const readProseMirrorDocument = (value: unknown): ProseMirrorDocument => {
	const parsed = storedDocumentSchema.safeParse(value);
	if (parsed.success) return parsed.data;
	const raw = attrValueSchema.safeParse(value);
	return {
		type: 'doc',
		content: [
			{
				type: 'unknown',
				raw: raw.success ? raw.data : null,
				reason: `Stored document is not readable: ${parsed.error.issues[0]?.message ?? 'unknown reason'}`
			}
		]
	};
};

/**
 * A document safe to hand to the editor.
 *
 * `ProseMirrorUnknownNode` is a storage concept: it exists so a list read cannot
 * throw. Tiptap has no such node type, and handing it one produces exactly the
 * failure the arm was added to prevent, one layer further out. So the seam into
 * the editor converts it, and converts it into something *visible and
 * preserved* — a code block holding the block's own JSON — rather than dropping
 * it. If the note is then saved, the user still has their content on screen and
 * in the document, as text they can see and copy, instead of a block that
 * vanished silently.
 *
 * In practice this should never fire: the corpus conformance spec fails if any
 * stored document contains an unknown node. It is here for the case that spec is
 * written to catch, in the window before someone fixes it.
 */
export const editableProseMirrorDocument = (document: ProseMirrorDocument): ProseMirrorDocument => {
	const convert = (node: ProseMirrorNode): ProseMirrorNode => {
		if (node.type === 'unknown')
			return {
				type: 'codeBlock',
				attrs: { language: 'json' },
				content: [{ type: 'text', text: JSON.stringify(node.raw, null, '\t') }]
			};
		if (!('content' in node) || !node.content) return node;
		return { ...node, content: node.content.map(convert) };
	};
	return { ...document, content: document.content?.map(convert) };
};

/** Every block that failed to parse, for the corpus spec and `check:boundaries`. */
export const unknownProseMirrorNodes = (
	document: ProseMirrorDocument
): readonly ProseMirrorUnknownNode[] =>
	(document.content ?? []).filter((node) => node.type === 'unknown');

// ---------------------------------------------------------------------------
// Validation (import boundary reports issues rather than throwing)
// ---------------------------------------------------------------------------

export interface ProseMirrorValidationIssue {
	readonly path: string;
	readonly message: string;
}

const issuePath = (path: readonly PropertyKey[]): string =>
	path.reduce<string>(
		(acc, segment) =>
			typeof segment === 'number' ? `${acc}[${segment}]` : `${acc}.${String(segment)}`,
		'$'
	);

/**
 * The first thing wrong with a document, or `undefined` when it parses clean.
 * The importer reports this instead of throwing so one bad note fails without
 * rejecting the files that imported fine (ADR 0014, ADR 0015).
 */
export const findProseMirrorDocumentIssue = (
	// audit-allow: no-unknown-type — Reports why a candidate document is unmodelled, so it has to accept one.
	document: unknown
): ProseMirrorValidationIssue | undefined => {
	const result = proseMirrorDocumentSchema.safeParse(document);
	if (result.success) return undefined;
	const issue = result.error.issues[0];
	if (!issue) return { path: '$', message: 'document is invalid' };
	return { path: issuePath(issue.path), message: issue.message };
};

export * from './note-patch';

export * from './note-links';

export * from './text-search';

export * from './section-numbering';

export * from './outline';

export * from './revision-diff';
