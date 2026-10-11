import type { ActorContext } from '$lib/models/identity';
import type { Provenance, ProvenanceId } from '$lib/models/provenance';
/** Append-only by design: a provenance record is never updated once written, since it exists to answer "what produced this" after the fact. */
export interface ProvenanceRepository {
	findById(id: ProvenanceId): Promise<Provenance | undefined>;
	insert(provenance: Provenance): Promise<Provenance>;
}
