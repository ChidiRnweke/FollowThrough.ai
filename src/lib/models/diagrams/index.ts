type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type DiagramId = Brand<string, 'DiagramId'>;
export type DiagramRevisionId = Brand<string, 'DiagramRevisionId'>;
export type DiagramEtag = Brand<string, 'DiagramEtag'>;

type ConversationId = Brand<string, 'ConversationId'>;

type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

type TodoResponsibility = 'mine' | 'waiting_on';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

export type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

interface DiagramBase {
	readonly id: DiagramId;
	readonly userId: UserId;
	/** Diagrams are owned by their project; a source note is optional context. */
	readonly projectId: ProjectId;
	/**
	 * The note this diagram was created from, when it was created from one.
	 * Absent for a studio diagram, which is authored in a conversation and belongs
	 * to the project rather than to any note.
	 */
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

/** A diagram whose editable source is Mermaid text; `renderedSvg` is a cache, not the source of truth. */
export interface MermaidDiagram extends DiagramBase {
	readonly kind: 'mermaid';
	readonly source: string;
}

/**
 * A diagram whose editable source is draw.io XML. `promotedFromId` links back to
 * the Mermaid diagram it was converted from, when it came from a conversion
 * rather than being authored directly.
 */
export interface DrawioDiagram extends DiagramBase {
	readonly kind: 'drawio';
	readonly source: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly publishedAt?: DateTime;
	readonly promotedFromId?: DiagramId;
}

export type Diagram = MermaidDiagram | DrawioDiagram;

export interface DiagramRevision {
	readonly id: DiagramRevisionId;
	readonly diagramId: DiagramId;
	readonly revision: number;
	readonly title?: string;
	readonly source: string;
	readonly renderedSvg?: string;
	readonly searchableText: string;
	readonly createdAt: DateTime;
}

export interface DiagramRevisionSummary {
	readonly id: DiagramRevisionId;
	readonly revision: number;
	readonly title?: string;
	readonly createdAt: DateTime;
	readonly isPublished: boolean;
}

export const diagramEtag = (diagram: Pick<DrawioDiagram, 'id' | 'currentRevision'>): DiagramEtag =>
	`diagram:${diagram.id}:r${diagram.currentRevision}` as DiagramEtag;

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

export type DiagramSuggestion = SuggestionBase<
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
	readonly renderedPngDataUrl?: string;
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

export interface GetProjectDiagramInput {
	readonly diagramId: DiagramId;
}

export interface ListProjectDiagramsInput {
	readonly projectId: ProjectId;
	readonly kind?: DiagramKind;
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export interface ListProjectDiagramsOutput {
	readonly diagrams: readonly Diagram[];
	readonly total: number;
}

export interface ListProjectDiagramsParams {
	readonly kind?: DiagramKind;
	readonly query?: string;
	readonly limit?: number;
	readonly offset?: number;
}

export interface KeepStudioDiagramInput {
	readonly projectId: ProjectId;
	/**
	 * Also the idempotency key. One studio conversation owns one evolving diagram,
	 * so a replayed event or a reconnect finds the diagram the first call created
	 * instead of making a second one.
	 */
	readonly conversationId: ConversationId;
	/** Uncompressed draw.io XML, as the agent presented it on the canvas. */
	readonly source: string;
	/**
	 * The SVG the draw.io embed exported when the user kept the diagram.
	 *
	 * Required, not optional: nothing outside that embed can render draw.io, so a
	 * diagram stored without one has no preview and no way to ever get one.
	 */
	readonly renderedSvg: string;
	readonly title?: string;
}

export interface KeepStudioDiagramOutput {
	readonly diagram: Diagram;
	/** False when this conversation's diagram already existed. */
	readonly created: boolean;
}

export interface RenameProjectDiagramInput {
	readonly diagramId: DiagramId;
	readonly title: string;
	readonly baseEtag: DiagramEtag;
}

export interface FindConversationDiagramInput {
	readonly conversationId: ConversationId;
}
export interface FindConversationDiagramOutput {
	readonly diagram?: Diagram;
}
export interface SaveProjectDiagramDraftInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly baseEtag: DiagramEtag;
}
export interface PublishProjectDiagramInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly renderedSvg: string;
	readonly baseEtag: DiagramEtag;
}
export interface PublishProjectDiagramOutput {
	readonly diagram: DrawioDiagram;
	readonly etag: DiagramEtag;
}
export interface ListDiagramRevisionsInput {
	readonly diagramId: DiagramId;
}
export interface ListDiagramRevisionsOutput {
	readonly revisions: readonly DiagramRevisionSummary[];
}
export interface GetDiagramRevisionInput {
	readonly diagramId: DiagramId;
	readonly revisionId: DiagramRevisionId;
}
export interface GetDiagramRevisionOutput {
	readonly revision: DiagramRevision;
}
export interface RestoreDiagramRevisionInput extends GetDiagramRevisionInput {
	readonly baseEtag: DiagramEtag;
}
export interface RestoreDiagramRevisionOutput {
	readonly diagram: DrawioDiagram;
	readonly etag: DiagramEtag;
}

export interface DeleteProjectDiagramInput {
	readonly diagramId: DiagramId;
}

export interface CountDiagramReferencesInput {
	readonly diagramId: DiagramId;
}

export interface PresentDiagramInput {
	/**
	 * Uncompressed draw.io XML.
	 *
	 * The canvas is draw.io only, by design rather than by omission. Mermaid is
	 * still how the agent iterates — it is cheap to write and cheap to read, so it
	 * belongs in the reply where the user can react to it in one glance. What
	 * reaches the canvas is the settled shape, and only draw.io is editable there,
	 * renderable to a stored preview, and linkable into a note.
	 */
	readonly source: string;
	readonly title?: string;
}

/**
 * A diagram the agent has put on the studio canvas. It is not stored: the canvas
 * shows it, and the user keeps it — as a new diagram, or in place of the one it
 * names in `diagramId`.
 */
export interface PresentDiagramOutput {
	readonly source: string;
	readonly title?: string;
}

/** A canvas version explicitly tied to an existing, actor-owned saved diagram. */
export interface PresentDiagramRevisionInput extends PresentDiagramInput {
	readonly diagramId: DiagramId;
}

export interface PresentDiagramRevisionOutput extends PresentDiagramOutput {
	readonly diagramId: DiagramId;
}

export interface ReadCanvasDiagramInput {
	readonly conversationId: ConversationId;
}

/**
 * The three states a conversation's canvas can be in.
 *
 * `present` used to be one arm carrying an optional `diagramId`, absent exactly
 * when the canvas held a new diagram — one fact stated twice, and the same
 * pairing that let a revision be read as a draft. The arms mirror
 * `PresentedDiagram`, which they cannot name: a model domain is self-contained,
 * so `presented-canvas` is not importable from here.
 */
export type ReadCanvasDiagramOutput =
	| {
			readonly kind: 'draft';
			readonly title?: string;
			/** Uncompressed draw.io XML; the canvas holds nothing else. */
			readonly source: string;
	  }
	| {
			readonly kind: 'revision';
			readonly title?: string;
			/** Uncompressed draw.io XML; the canvas holds nothing else. */
			readonly source: string;
			/** The saved diagram this canvas version revises. */
			readonly diagramId: DiagramId;
	  }
	| {
			readonly kind: 'empty';
			readonly message: string;
			readonly nextActions: readonly [
				{
					readonly tool: 'present_diagram';
					readonly reason: string;
				}
			];
	  };

export interface SearchDiagramIconsInput {
	/**
	 * One term. The icon library matches names, not phrases — "azure app service"
	 * finds nothing where "azure" finds plenty.
	 */
	readonly query: string;
	readonly limit?: number;
}

export interface SearchDiagramIconsOutput {
	readonly icons: readonly { readonly name: string; readonly url: string }[];
}

export interface ReadProjectDiagramInput {
	readonly diagramId: DiagramId;
}

/** A saved diagram as the agent sees it; source is read through its virtual file. */
export interface ReadProjectDiagramOutput {
	readonly id: DiagramId;
	readonly projectId: ProjectId;
	readonly kind: DiagramKind;
	readonly title?: string;
	readonly labels: string;
}

export interface SaveProjectDrawioInput {
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly renderedSvg: string;
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
