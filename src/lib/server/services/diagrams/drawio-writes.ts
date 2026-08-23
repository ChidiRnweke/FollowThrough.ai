import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DrawioDiagram } from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';

const now = (): DateTime => new Date().toISOString() as DateTime;

interface DiagramUpdater {
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

export interface DrawioRevision {
	readonly source: string;
	readonly renderedSvg: string;
}

/**
 * Writing a new version of a draw.io diagram: validate, sanitize the preview,
 * re-extract its searchable text, persist, re-index.
 *
 * One place, because the sequence was written out three times — the note-scoped
 * save, the studio save, and the conversion review — and every one of those five
 * steps has to happen for the diagram to stay findable and previewable. A caller
 * that forgot the re-extract left a diagram that searched as its old self.
 *
 * Deciding *which* diagram may be written is the caller's business and stays
 * there: the note-scoped save checks the note, the studio checks ownership, the
 * review checks the suggestion. This only knows how to write one.
 */
export class DrawioWrites {
	constructor(
		private readonly diagrams: DiagramUpdater,
		private readonly sourceValidator: DrawioSourceValidator,
		private readonly previewSanitizer: DrawioPreviewSanitizer,
		private readonly textExtractor: DiagramTextExtractor,
		private readonly indexer: DiagramIndexer
	) {}

	async write(
		actor: ActorContext,
		current: DrawioDiagram,
		revision: DrawioRevision
	): Promise<DrawioDiagram> {
		const source = this.sourceValidator.validate(revision.source);
		const renderedSvg = this.previewSanitizer.sanitize(revision.renderedSvg);
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
