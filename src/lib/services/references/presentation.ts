import type { ExternalReference, ReferenceView } from '$lib/models/references';

export function assembleReferenceView(
	reference: ExternalReference,
	facts: Pick<ReferenceView, 'anchor'>
): ReferenceView {
	return { reference, ...(facts.anchor ? { anchor: facts.anchor } : {}) };
}
