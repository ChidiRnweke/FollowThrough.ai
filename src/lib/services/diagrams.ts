import type {
	ActorContext,
	Diagram,
	DiagramId,
	DrawioDiagram,
	MermaidDiagram,
	TextSelection
} from '../models';
export interface MermaidDiagramCreator {
	create(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<{ title?: string; source: string }>;
}
export interface MermaidDiagramReviser {
	revise(
		actor: ActorContext,
		diagram: MermaidDiagram,
		instruction: string
	): Promise<MermaidDiagram>;
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
export interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}
export interface DiagramIndexer {
	index(actor: ActorContext, diagram: Diagram): Promise<void>;
}
