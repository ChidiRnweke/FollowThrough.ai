import type { ActorContext } from '$lib/models/identity';
import type { Provenance, ProvenanceId } from '$lib/models/provenance';
/** Append-only by design: a provenance record is never updated once written, since it exists to answer "what produced this" after the fact. */
export interface ProvenanceRepository {
	findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined>;
	insert(actor: ActorContext, provenance: Provenance): Promise<Provenance>;
}
