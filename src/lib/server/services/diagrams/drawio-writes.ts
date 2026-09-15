import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DrawioDiagram, DrawioRevision } from '$lib/models/diagrams';
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

/** Validate the source and preview, extract search text, and save the diagram. */
export class DrawioWrites {
	constructor(
		private readonly diagrams: DiagramUpdater,
		private readonly sourceValidator: DrawioSourceValidator,
		private readonly previewSanitizer: DrawioPreviewSanitizer,
		private readonly textExtractor: DiagramTextExtractor
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
		return diagram;
	}
}
