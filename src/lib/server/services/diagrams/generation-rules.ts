import type {
	Diagram,
	MermaidDiagram,
	DiagramTask,
	DiagramActionInput
} from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';
import type { ProvenanceId } from '$lib/models/provenance';
import { ValidationError, StaleRevisionError } from '$lib/errors';
const assertRenderedPng = (dataUrl: string | undefined): void => {
	if (!dataUrl) return;
	const encoded = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1];
	if (!encoded) throw new ValidationError('Rendered diagram must be a base64 PNG.');
	const bytes = Buffer.from(encoded, 'base64');
	if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
		throw new ValidationError('Rendered diagram is not a valid PNG.');
};

const diagramRevisionModel = (
	configuredModel: string,
	supportsVision: boolean,
	hasRenderedImage: boolean,
	fallbackVisionModel: string
): string => (hasRenderedImage && !supportsVision ? fallbackVisionModel : configuredModel);

/** Generation may only replace the active content from which it started. */
function prepareMermaidRevision(
	current: Diagram,
	base: MermaidDiagram,
	draft: Pick<MermaidDiagram, 'source' | 'title'> & { readonly provenanceId: ProvenanceId },
	timestamp: DateTime
): MermaidDiagram & { readonly provenanceId: ProvenanceId } {
	if (current.archivedAt) throw new ValidationError('Archived diagrams cannot be revised');
	if (
		current.kind !== 'mermaid' ||
		current.source !== base.source ||
		current.title !== base.title ||
		current.provenanceId !== base.provenanceId ||
		current.updatedAt !== base.updatedAt
	)
		throw new StaleRevisionError('The diagram changed while its revision was generated');
	return {
		...current,
		...(draft.title ? { title: draft.title } : {}),
		source: draft.source,
		provenanceId: draft.provenanceId,
		updatedAt: timestamp
	};
}

export interface DiagramGenerationRules {
	validate(task: DiagramTask | DiagramActionInput): void;
	model(
		configuredModel: string,
		supportsVision: boolean,
		hasRenderedImage: boolean,
		fallbackVisionModel: string
	): string;
	revision(
		current: Diagram,
		base: MermaidDiagram,
		draft: Pick<MermaidDiagram, 'source' | 'title'> & { readonly provenanceId: ProvenanceId },
		timestamp: DateTime
	): MermaidDiagram & { readonly provenanceId: ProvenanceId };
}
export class DiagramGenerationRuleService implements DiagramGenerationRules {
	validate(task: DiagramTask | DiagramActionInput): void {
		assertRenderedPng(task.operation === 'revise' ? task.renderedPngDataUrl : undefined);
		if (task.operation === 'generate' && !task.selection.text.trim())
			throw new ValidationError('Diagram source text is required.');
		if (task.operation === 'revise' && !task.instruction.trim())
			throw new ValidationError('Describe how the diagram should change.');
		if (task.operation === 'convert' && !task.source.trim())
			throw new ValidationError('Mermaid source is required for draw.io conversion.');
	}

	model(
		configuredModel: string,
		supportsVision: boolean,
		hasRenderedImage: boolean,
		fallbackVisionModel: string
	): string {
		return diagramRevisionModel(
			configuredModel,
			supportsVision,
			hasRenderedImage,
			fallbackVisionModel
		);
	}
	revision(
		current: Diagram,
		base: MermaidDiagram,
		draft: Pick<MermaidDiagram, 'source' | 'title'> & { readonly provenanceId: ProvenanceId },
		timestamp: DateTime
	): MermaidDiagram & { readonly provenanceId: ProvenanceId } {
		return prepareMermaidRevision(current, base, draft, timestamp);
	}
}
