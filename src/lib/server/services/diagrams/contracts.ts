import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type {
	Diagram,
	DiagramId,
	DiagramEtag,
	DiagramRevision,
	DiagramRevisionId,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams,
	DrawioDiagram,
	MermaidDiagram,
	ReviseInlineMermaidInput,
	ReviseInlineMermaidOutput,
	ConvertInlineMermaidInput
} from '$lib/models/diagrams';
import type { NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
export interface DiagramIconSearch {
	search(query: string, limit?: number): Promise<readonly { name: string; url: string }[]>;
}
export interface MermaidDiagramDraft {
	readonly title?: string;
	readonly source: string;
	readonly provenanceId?: ProvenanceId;
}
export interface DrawioDiagramDraft {
	readonly title: string;
	readonly source: string;
	readonly provenanceId?: ProvenanceId;
}
export interface MermaidDiagramCreator {
	create(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string,
		signal?: AbortSignal
	): Promise<MermaidDiagramDraft>;
}
export interface MermaidDiagramReviser {
	revise(
		actor: ActorContext,
		diagram: MermaidDiagram,
		instruction: string
	): Promise<MermaidDiagram>;
}
export interface InlineMermaidReviser {
	reviseInline(
		actor: ActorContext,
		input: ReviseInlineMermaidInput,
		signal?: AbortSignal
	): Promise<ReviseInlineMermaidOutput>;
}
export interface InlineMermaidToDrawioConverter {
	convertInline(
		actor: ActorContext,
		input: ConvertInlineMermaidInput,
		signal?: AbortSignal
	): Promise<DrawioDiagramDraft>;
}
export interface MermaidDiagramRenderer {
	render(source: string): Promise<string>;
}
export interface DrawioDiagramCreator {
	createFromMermaid(actor: ActorContext, diagram: MermaidDiagram): Promise<DrawioDiagram>;
}
export interface DrawioDiagramExporter {
	exportSvg(diagram: DrawioDiagram): Promise<string>;
}
export interface DiagramPromoter {
	promote(
		actor: ActorContext,
		source: MermaidDiagram,
		target: DrawioDiagram
	): Promise<DrawioDiagram>;
}
export interface DiagramTextExtractor {
	/**
	 * Takes the source rather than a whole `Diagram`, because the source is all
	 * any extractor reads. Callers that have only just built a source — the studio
	 * keep path — would otherwise have to assert a `Diagram` they do not have.
	 */
	extract(diagram: DiagramSource): Promise<string>;
}

/** The part of a diagram that carries text. */
export interface DiagramSource {
	readonly source: string;
}
export interface DiagramFinder {
	get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLister {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput>;
	countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<number>;
}
export interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}
/** Finds the diagram a studio conversation already produced, so promotion stays idempotent. */
export interface DiagramConversationFinder {
	findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined>;
}
/** Counts the notes rendering a diagram, to word its delete confirmation. */
export interface DiagramReferenceCounter {
	countReferencingNotes(actor: ActorContext, diagramId: DiagramId): Promise<number>;
}
export interface DiagramRenamer {
	rename(
		actor: ActorContext,
		diagramId: DiagramId,
		title: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram>;
}
export interface DiagramDraftWriter {
	saveDraftSource(
		actor: ActorContext,
		diagramId: DiagramId,
		source: string,
		searchableText: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram>;
	publish(
		actor: ActorContext,
		diagramId: DiagramId,
		source: string,
		renderedSvg: string,
		searchableText: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram>;
	recordRevision(actor: ActorContext, diagram: DrawioDiagram): Promise<DiagramRevision>;
	restore(
		actor: ActorContext,
		diagramId: DiagramId,
		revisionId: DiagramRevisionId,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram>;
}
export interface DiagramRevisionReader {
	revisions(actor: ActorContext, diagramId: DiagramId): Promise<readonly DiagramRevision[]>;
	revision(
		actor: ActorContext,
		diagramId: DiagramId,
		revisionId: DiagramRevisionId
	): Promise<DiagramRevision>;
}
export interface DiagramDeleter {
	delete(actor: ActorContext, diagramId: DiagramId): Promise<void>;
}
/**
 * Soft delete, so an unwanted diagram is recoverable the way an unwanted note is.
 *
 * Separate from `DiagramDeleter`: permanent deletion still exists and still means
 * what it says. These three are the reversible half.
 */
export interface DiagramArchiver {
	archive(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
	unarchive(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
	listArchived(actor: ActorContext, projectId?: ProjectId): Promise<readonly Diagram[]>;
}
export interface DiagramIndexer {
	index(actor: ActorContext, diagram: Diagram): Promise<void>;
}
/** Parses Mermaid source and throws when it will not render. */
export interface MermaidSourceValidator {
	validate(source: string): Promise<void>;
}
export interface DrawioXmlContentValidator {
	validate(source: string): string;
}
export interface DrawioSvgPreviewSanitizer {
	sanitize(source: string): string;
}
