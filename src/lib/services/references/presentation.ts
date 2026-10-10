import type { ExternalReference, ReferenceView } from '$lib/models/references';

function assembleReferenceView(
	reference: ExternalReference,
	facts: Pick<ReferenceView, 'anchor'>
): ReferenceView {
	return { reference, ...(facts.anchor ? { anchor: facts.anchor } : {}) };
}

export interface ReferencePresentation {
	assembleReferenceView(
		reference: ExternalReference,
		facts: Pick<ReferenceView, 'anchor'>
	): ReferenceView;
}
export class ReferencePresentationService implements ReferencePresentation {
	assembleReferenceView(
		reference: ExternalReference,
		facts: Pick<ReferenceView, 'anchor'>
	): ReferenceView {
		return assembleReferenceView(reference, facts);
	}
}
