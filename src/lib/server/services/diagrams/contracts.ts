import type {
	ActorContext,
	Diagram,
	DiagramId,
	DrawioDiagram,
	MermaidDiagram,
	NoteId,
	ProjectId,
	TextSelection,
	ProvenanceId,
	ReviseInlineMermaidInput,
	ReviseInlineMermaidOutput,
	ConvertInlineMermaidInput
} from '$lib/models';
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
		instruction?: string
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
		input: ReviseInlineMermaidInput
	): Promise<ReviseInlineMermaidOutput>;
}
export interface InlineMermaidToDrawioConverter {
	convertInline(actor: ActorContext, input: ConvertInlineMermaidInput): Promise<DrawioDiagramDraft>;
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
	extract(diagram: Diagram): Promise<string>;
}
export interface DiagramFinder {
	get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLister {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]>;
}
export interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}
export interface DiagramDeleter {
	delete(actor: ActorContext, diagramId: DiagramId): Promise<void>;
}
export interface DiagramIndexer {
	index(actor: ActorContext, diagram: Diagram): Promise<void>;
}
export interface DrawioXmlContentValidator {
	validate(source: string): string;
}
export interface DrawioSvgPreviewSanitizer {
	sanitize(source: string): string;
}
