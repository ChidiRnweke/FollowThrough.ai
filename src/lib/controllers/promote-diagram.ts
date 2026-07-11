import type {
	ActorContext,
	DrawioDiagram,
	PromoteDiagramInput,
	PromoteDiagramOutput
} from '../models';
import { UnsupportedDiagramOperationError } from '../models';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramPromoter,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramCreator,
	DrawioDiagramExporter
} from '../services';
export interface PromoteDiagramDependencies {
	diagramFinder: DiagramFinder;
	drawioCreator: DrawioDiagramCreator;
	drawioExporter: DrawioDiagramExporter;
	diagramPromoter: DiagramPromoter;
	textExtractor: DiagramTextExtractor;
	diagramWriter: DiagramWriter;
	diagramIndexer: DiagramIndexer;
}
export class DefaultPromoteDiagramController {
	constructor(private readonly dependencies: PromoteDiagramDependencies) {}
	async execute(actor: ActorContext, input: PromoteDiagramInput): Promise<PromoteDiagramOutput> {
		const source = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (source.kind !== 'mermaid')
			throw new UnsupportedDiagramOperationError('Only Mermaid diagrams can be promoted');
		const draft = await this.dependencies.drawioCreator.createFromMermaid(actor, source);
		const promoted = await this.dependencies.diagramPromoter.promote(actor, source, draft);
		const renderedSvg = await this.dependencies.drawioExporter.exportSvg(promoted);
		const searchableText = await this.dependencies.textExtractor.extract(promoted);
		const saved = (await this.dependencies.diagramWriter.create(actor, {
			...promoted,
			renderedSvg,
			searchableText
		})) as DrawioDiagram;
		await this.dependencies.diagramIndexer.index(actor, saved);
		return { source, promoted: saved };
	}
}
