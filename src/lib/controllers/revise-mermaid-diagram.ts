import type {
	ActorContext,
	MermaidDiagram,
	ReviseMermaidDiagramInput,
	ReviseMermaidDiagramOutput
} from '../models';
import { UnsupportedDiagramOperationError } from '../models';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramTextExtractor,
	DiagramWriter,
	MermaidDiagramRenderer,
	MermaidDiagramReviser
} from '../services';
export interface ReviseMermaidDiagramDependencies {
	diagramFinder: DiagramFinder;
	diagramReviser: MermaidDiagramReviser;
	diagramRenderer: MermaidDiagramRenderer;
	textExtractor: DiagramTextExtractor;
	diagramWriter: DiagramWriter;
	diagramIndexer: DiagramIndexer;
}
export class DefaultReviseMermaidDiagramController {
	constructor(private readonly dependencies: ReviseMermaidDiagramDependencies) {}
	async execute(
		actor: ActorContext,
		input: ReviseMermaidDiagramInput
	): Promise<ReviseMermaidDiagramOutput> {
		const existing = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (existing.kind !== 'mermaid')
			throw new UnsupportedDiagramOperationError('Only Mermaid diagrams can be revised by AI');
		const revised = await this.dependencies.diagramReviser.revise(
			actor,
			existing,
			input.instruction
		);
		const renderedSvg = await this.dependencies.diagramRenderer.render(revised.source);
		const searchableText = await this.dependencies.textExtractor.extract(revised);
		const saved = (await this.dependencies.diagramWriter.update(actor, {
			...revised,
			renderedSvg,
			searchableText
		})) as MermaidDiagram;
		await this.dependencies.diagramIndexer.index(actor, saved);
		return { diagram: saved };
	}
}
