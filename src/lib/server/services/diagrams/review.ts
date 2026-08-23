import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DrawioDiagram, DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';

const now = (): DateTime => new Date().toISOString() as DateTime;

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
	extract(diagram: { readonly source: string }): Promise<string>;
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

/**
 * Accepting a reviewed conversion into the note it was raised against.
 *
 * The write sequence below is the same one `DrawioWrites` performs for the
 * editor and the studio, and it is spelled out again rather than shared: one
 * service never imports another. What differs is the guard — this one answers to
 * a suggestion and a note, which is the reason it exists separately.
 */
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
		if (current.sourceNoteId !== input.noteId || current.kind !== 'drawio')
			throw new ValidationError('The suggestion did not create the expected draw.io diagram.');
		const source = this.sourceValidator.validate(input.source);
		const renderedSvg = this.previewSanitizer.sanitize(input.renderedSvg);
		const searchableText = await this.textExtractor.extract({ ...current, source });
		const diagram = (await this.diagrams.update(actor, {
			...current,
			source,
			renderedSvg,
			searchableText,
			updatedAt: now()
		})) as DrawioDiagram;
		await this.indexer.index(actor, diagram);
		return diagram;
	}
}
