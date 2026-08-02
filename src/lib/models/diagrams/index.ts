type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type DiagramId = Brand<string, 'DiagramId'>;

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
	readonly noteId: NoteId;
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
	readonly promotedFromId?: DiagramId;
}

export type Diagram = MermaidDiagram | DrawioDiagram;

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
