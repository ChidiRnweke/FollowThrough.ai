import type { Provenance, ProvenanceOrigin } from '$lib/models/provenance';

/** A pipeline identifies its output; other producers identify themselves. */
export const provenanceOrigin = (provenance: Provenance): ProvenanceOrigin =>
	'pipeline' in provenance
		? { pipeline: provenance.pipeline, createdAt: provenance.createdAt }
		: { producerName: provenance.producerName, createdAt: provenance.createdAt };
