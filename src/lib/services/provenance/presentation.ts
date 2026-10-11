import type { Provenance, ProvenanceOrigin } from '$lib/models/provenance';

/** A pipeline identifies its output; other producers identify themselves. */
const provenanceOrigin = (provenance: Provenance): ProvenanceOrigin =>
	'pipeline' in provenance
		? { pipeline: provenance.pipeline, createdAt: provenance.createdAt }
		: { producerName: provenance.producerName, createdAt: provenance.createdAt };

export interface ProvenancePresentation {
	provenanceOrigin(provenance: Provenance): ProvenanceOrigin;
}
export class ProvenancePresentationService implements ProvenancePresentation {
	provenanceOrigin(provenance: Provenance): ProvenanceOrigin {
		return provenanceOrigin(provenance);
	}
}
