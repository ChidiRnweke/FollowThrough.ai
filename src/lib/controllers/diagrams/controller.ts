import type {
	ActorContext,
	DrawioDiagram,
	GenerateMermaidDiagramInput,
	GenerateMermaidDiagramOutput,
	MermaidDiagram,
	PromoteDiagramInput,
	PromoteDiagramOutput,
	ReviseMermaidDiagramInput,
	ReviseMermaidDiagramOutput,
	ReviseInlineMermaidInput,
	ReviseInlineMermaidOutput
} from '$lib/models';
import { UnsupportedDiagramOperationError } from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramPromoter,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramCreator,
	DrawioDiagramExporter,
	MermaidDiagramCreator,
	MermaidDiagramRenderer,
	MermaidDiagramReviser,
	InlineMermaidReviser,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionCreator
} from '$lib/services';

export interface DiagramsController {
	generateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<GenerateMermaidDiagramOutput>;
	reviseMermaid(
		actor: ActorContext,
		input: ReviseMermaidDiagramInput
	): Promise<ReviseMermaidDiagramOutput>;
	reviseInlineMermaid(
		actor: ActorContext,
		input: ReviseInlineMermaidInput
	): Promise<ReviseInlineMermaidOutput>;
	promote(actor: ActorContext, input: PromoteDiagramInput): Promise<PromoteDiagramOutput>;
}

export interface DiagramsDependencies {
	anchorCreator: SelectionAnchorCreator;
	mermaidCreator: MermaidDiagramCreator;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	diagramFinder: DiagramFinder;
	mermaidReviser: MermaidDiagramReviser;
	inlineMermaidReviser: InlineMermaidReviser;
	mermaidRenderer: MermaidDiagramRenderer;
	textExtractor: DiagramTextExtractor;
	diagramWriter: DiagramWriter;
	diagramIndexer: DiagramIndexer;
	drawioCreator: DrawioDiagramCreator;
	drawioExporter: DrawioDiagramExporter;
	diagramPromoter: DiagramPromoter;
}

export class DefaultDiagramsController implements DiagramsController {
	constructor(private readonly dependencies: DiagramsDependencies) {}

	generateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<GenerateMermaidDiagramOutput> {
		return this.dependencies.mermaidCreator
			.create(actor, input.selection, input.instruction)
			.then(({ provenanceId: agentProvenanceId, ...diagram }) =>
				this.dependencies.transactionRunner.run(async () => {
					const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
					const provenanceId =
						agentProvenanceId ??
						(
							await this.dependencies.provenanceRecorder.record(actor, {
								producerKind: 'agent',
								producerName: 'Mermaid Diagram Creator',
								pipeline: 'agent',
								sourceAnchorId: anchor.id,
								metadata: {}
							})
						).id;
					const suggestion = await this.dependencies.suggestionCreator.create(actor, {
						kind: 'diagram',
						noteId: input.selection.noteId,
						provenanceId,
						sourceAnchorId: anchor.id,
						payload: { noteId: input.selection.noteId, kind: 'mermaid', ...diagram }
					});
					return { anchorId: anchor.id, suggestion };
				})
			);
	}

	reviseInlineMermaid(
		actor: ActorContext,
		input: ReviseInlineMermaidInput
	): Promise<ReviseInlineMermaidOutput> {
		return this.dependencies.inlineMermaidReviser.reviseInline(actor, input);
	}

	async reviseMermaid(
		actor: ActorContext,
		input: ReviseMermaidDiagramInput
	): Promise<ReviseMermaidDiagramOutput> {
		const existing = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (existing.kind !== 'mermaid')
			throw new UnsupportedDiagramOperationError('Only Mermaid diagrams can be revised by AI');
		const revised = await this.dependencies.mermaidReviser.revise(
			actor,
			existing,
			input.instruction
		);
		const renderedSvg = await this.dependencies.mermaidRenderer.render(revised.source);
		const searchableText = await this.dependencies.textExtractor.extract(revised);
		const saved = (await this.dependencies.diagramWriter.update(actor, {
			...revised,
			renderedSvg,
			searchableText
		})) as MermaidDiagram;
		await this.dependencies.diagramIndexer.index(actor, saved);
		return { diagram: saved };
	}

	async promote(actor: ActorContext, input: PromoteDiagramInput): Promise<PromoteDiagramOutput> {
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
