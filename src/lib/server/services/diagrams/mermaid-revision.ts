import type { Diagram, MermaidDiagram } from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';
import { StaleRevisionError, ValidationError } from '$lib/errors';

/** Generation may only replace the active content from which it started. */
export function prepareMermaidRevision(
	current: Diagram,
	base: MermaidDiagram,
	draft: Pick<MermaidDiagram, 'source' | 'title' | 'provenanceId'>,
	timestamp: DateTime
): MermaidDiagram {
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
