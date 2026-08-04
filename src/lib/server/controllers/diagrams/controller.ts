import type { ActorContext } from '$lib/models/identity';
import type {
	DrawioDiagram,
	ConvertInlineMermaidInput,
	ConvertInlineMermaidOutput,
	GetDrawioDiagramInput,
	SaveDrawioDiagramInput,
	SaveDrawioDiagramOutput,
	GenerateMermaidDiagramInput,
	GenerateMermaidDiagramOutput,
	MermaidDiagram,
	PromoteDiagramInput,
	PromoteDiagramOutput,
	ReviseMermaidDiagramInput,
	ReviseMermaidDiagramOutput,
	ReviseInlineMermaidInput,
	ReviseInlineMermaidOutput
} from '$lib/models/diagrams';
import { NotFoundError, UnsupportedDiagramOperationError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramCreator,
	MermaidDiagramCreator,
	MermaidDiagramRenderer,
	MermaidDiagramReviser,
	InlineMermaidReviser,
	InlineMermaidToDrawioConverter,
	DrawioXmlContentValidator,
	DrawioSvgPreviewSanitizer
} from '$lib/server/services/diagrams/contracts';
import type { AgentRunReceipt } from '$lib/models/agent';
import type { WorkflowRunStarter } from '$lib/server/services/agent/runs/workflow';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';

/**
 * Application boundary for diagrams: generating and revising Mermaid diagrams from a
 * selection, converting between Mermaid and draw.io, and editing persisted draw.io
 * diagrams. Agent-generated diagrams arrive as suggestions; only the draw.io editing
 * surface writes straight to a persisted diagram.
 */
export interface DiagramsController {
	/**
	 * Generate a Mermaid diagram from a text selection, optionally following an
	 * instruction, and create a diagram suggestion with provenance — all in one
	 * transaction so the anchor, provenance, and suggestion land atomically.
	 */
	generateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput,
		signal?: AbortSignal
	): Promise<GenerateMermaidDiagramOutput>;
	/**
	 * Revise an existing Mermaid diagram by instruction: re-render its SVG, re-extract
	 * searchable text, persist, and re-index.
	 *
	 * @throws UnsupportedDiagramOperationError if the diagram is not Mermaid — only
	 * Mermaid can be revised by AI.
	 */
	reviseMermaid(
		actor: ActorContext,
		input: ReviseMermaidDiagramInput
	): Promise<ReviseMermaidDiagramOutput>;
	/** Revise an inline Mermaid diagram in a note's document (one never promoted to a standalone diagram). */
	reviseInlineMermaid(
		actor: ActorContext,
		input: ReviseInlineMermaidInput,
		signal?: AbortSignal
	): Promise<ReviseInlineMermaidOutput>;
	/**
	 * Convert an inline Mermaid diagram into a draw.io draft and create a suggestion,
	 * validating the generated XML and recording provenance before anything is offered.
	 */
	convertInlineMermaid(
		actor: ActorContext,
		input: ConvertInlineMermaidInput,
		signal?: AbortSignal
	): Promise<ConvertInlineMermaidOutput>;
	/**
	 * Fetch a draw.io diagram for editing.
	 *
	 * @throws NotFoundError if the diagram is not in the given note; throws
	 * UnsupportedDiagramOperationError if it is not draw.io.
	 */
	getDrawio(actor: ActorContext, input: GetDrawioDiagramInput): Promise<DrawioDiagram>;
	/**
	 * Persist an edited draw.io diagram: validate the XML, sanitize the SVG preview,
	 * re-extract searchable text, write, and re-index in one transaction.
	 */
	saveDrawio(actor: ActorContext, input: SaveDrawioDiagramInput): Promise<SaveDrawioDiagramOutput>;
	/**
	 * Promote a Mermaid diagram to a draw.io diagram, creating a suggestion the user can
	 * accept to replace the Mermaid original.
	 *
	 * @throws UnsupportedDiagramOperationError if the source is not Mermaid.
	 */
	promote(actor: ActorContext, input: PromoteDiagramInput): Promise<PromoteDiagramOutput>;
	/**
	 * Start {@link generateMermaid} as a cancellable run and return once the run is
	 * durable, long before the diagram exists.
	 *
	 * The editor's AI actions used to be one awaited request, which left a refresh
	 * with no way back to work still in flight and the user with no way to stop it.
	 * The receipt names the run to attach to, and its result arrives as a
	 * `workflow_result` event on that run's stream.
	 */
	startGenerateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<AgentRunReceipt>;
	/** Start {@link reviseInlineMermaid} as a cancellable run. See {@link startGenerateMermaid}. */
	startReviseInlineMermaid(
		actor: ActorContext,
		input: ReviseInlineMermaidInput
	): Promise<AgentRunReceipt>;
	/** Start {@link convertInlineMermaid} as a cancellable run. See {@link startGenerateMermaid}. */
	startConvertInlineMermaid(
		actor: ActorContext,
		input: ConvertInlineMermaidInput
	): Promise<AgentRunReceipt>;
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
	inlineMermaidToDrawioConverter: InlineMermaidToDrawioConverter;
	drawioXmlValidator: DrawioXmlContentValidator;
	drawioSvgSanitizer: DrawioSvgPreviewSanitizer;
	mermaidRenderer: MermaidDiagramRenderer;
	textExtractor: DiagramTextExtractor;
	drawioTextExtractor: DiagramTextExtractor;
	diagramWriter: DiagramWriter;
	diagramIndexer: DiagramIndexer;
	drawioCreator: DrawioDiagramCreator;
	workflowRunner: WorkflowRunStarter;
}

export class Diagrams implements DiagramsController {
	constructor(private readonly dependencies: DiagramsDependencies) {}

	generateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput,
		signal?: AbortSignal
	): Promise<GenerateMermaidDiagramOutput> {
		return this.dependencies.mermaidCreator
			.create(actor, input.selection, input.instruction, signal)
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
		input: ReviseInlineMermaidInput,
		signal?: AbortSignal
	): Promise<ReviseInlineMermaidOutput> {
		return this.dependencies.inlineMermaidReviser.reviseInline(actor, input, signal);
	}

	startGenerateMermaid(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'diagram',
			noteId: input.selection.noteId,
			title: 'Generate Mermaid diagram',
			run: (signal) => this.generateMermaid(actor, input, signal)
		});
	}

	startReviseInlineMermaid(
		actor: ActorContext,
		input: ReviseInlineMermaidInput
	): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'revise',
			noteId: input.noteId,
			title: 'Revise Mermaid diagram',
			run: (signal) => this.reviseInlineMermaid(actor, input, signal)
		});
	}

	startConvertInlineMermaid(
		actor: ActorContext,
		input: ConvertInlineMermaidInput
	): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'convert',
			noteId: input.noteId,
			title: 'Convert Mermaid to draw.io',
			run: (signal) => this.convertInlineMermaid(actor, input, signal)
		});
	}

	convertInlineMermaid(
		actor: ActorContext,
		input: ConvertInlineMermaidInput,
		signal?: AbortSignal
	): Promise<ConvertInlineMermaidOutput> {
		return this.dependencies.inlineMermaidToDrawioConverter
			.convertInline(actor, input, signal)
			.then(({ provenanceId: agentProvenanceId, ...draft }) =>
				this.dependencies.transactionRunner.run(async () => {
					const provenanceId =
						agentProvenanceId ??
						(
							await this.dependencies.provenanceRecorder.record(actor, {
								producerKind: 'agent',
								producerName: 'Diagram Agent',
								pipeline: 'agent',
								metadata: { operation: 'convert' }
							})
						).id;
					this.dependencies.drawioXmlValidator.validate(draft.source);
					const suggestion = await this.dependencies.suggestionCreator.create(actor, {
						kind: 'diagram',
						noteId: input.noteId,
						provenanceId,
						payload: { noteId: input.noteId, kind: 'drawio', ...draft }
					});
					return { suggestion };
				})
			);
	}

	async getDrawio(actor: ActorContext, input: GetDrawioDiagramInput): Promise<DrawioDiagram> {
		const diagram = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (diagram.noteId !== input.noteId) throw new NotFoundError('Diagram was not found');
		if (diagram.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
		return diagram;
	}

	saveDrawio(actor: ActorContext, input: SaveDrawioDiagramInput): Promise<SaveDrawioDiagramOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.getDrawio(actor, input);
			const source = this.dependencies.drawioXmlValidator.validate(input.source);
			const renderedSvg = this.dependencies.drawioSvgSanitizer.sanitize(input.renderedSvg);
			const searchableText = await this.dependencies.drawioTextExtractor.extract({
				...current,
				source
			});
			const diagram = (await this.dependencies.diagramWriter.update(actor, {
				...current,
				source,
				renderedSvg,
				searchableText,
				updatedAt: new Date().toISOString() as DrawioDiagram['updatedAt']
			})) as DrawioDiagram;
			await this.dependencies.diagramIndexer.index(actor, diagram);
			return { diagram };
		});
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
		this.dependencies.drawioXmlValidator.validate(draft.source);
		const suggestion = await this.dependencies.transactionRunner.run(async () => {
			const provenanceId =
				draft.provenanceId ??
				(
					await this.dependencies.provenanceRecorder.record(actor, {
						producerKind: 'agent',
						producerName: 'Diagram Agent',
						pipeline: 'agent',
						metadata: { operation: 'convert', sourceDiagramId: source.id }
					})
				).id;
			return this.dependencies.suggestionCreator.create(actor, {
				kind: 'diagram',
				noteId: source.noteId,
				provenanceId,
				payload: {
					noteId: source.noteId,
					kind: 'drawio',
					title: draft.title,
					source: draft.source
				}
			});
		});
		return { source, suggestion };
	}
}
