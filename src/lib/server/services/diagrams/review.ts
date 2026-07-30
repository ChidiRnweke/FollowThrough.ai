import type { ActorContext, Diagram, DrawioDiagram, DiagramId, NoteId } from '$lib/models';
import { ValidationError } from '$lib/errors';

interface DiagramReader {
	get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
}

interface DiagramWriter {
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
}

interface DrawioSourceValidator {
	validate(source: string): string;
}

interface DrawioPreviewSanitizer {
	sanitize(source: string): string;
}

interface DiagramTextExtractor {
	extract(diagram: Diagram): Promise<string>;
}

interface DiagramIndexer {
	index(actor: ActorContext, diagram: Diagram): Promise<void>;
}

export interface DrawioReviewInput {
	readonly noteId: NoteId;
	readonly diagramId: DiagramId;
	readonly source: string;
	readonly renderedSvg: string;
}

export class DrawioReview {
	constructor(
		private readonly diagrams: DiagramReader & DiagramWriter,
		private readonly sourceValidator: DrawioSourceValidator,
		private readonly previewSanitizer: DrawioPreviewSanitizer,
		private readonly textExtractor: DiagramTextExtractor,
		private readonly indexer: DiagramIndexer
	) {}

	async save(actor: ActorContext, input: DrawioReviewInput): Promise<DrawioDiagram> {
		const current = await this.diagrams.get(actor, input.diagramId);
		if (current.noteId !== input.noteId || current.kind !== 'drawio')
			throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
		const source = this.sourceValidator.validate(input.source);
		const renderedSvg = this.previewSanitizer.sanitize(input.renderedSvg);
		const searchableText = await this.textExtractor.extract({ ...current, source });
		const diagram = (await this.diagrams.update(actor, {
			...current,
			source,
			renderedSvg,
			searchableText,
			updatedAt: new Date().toISOString() as DrawioDiagram['updatedAt']
		})) as DrawioDiagram;
		await this.indexer.index(actor, diagram);
		return diagram;
	}
}
