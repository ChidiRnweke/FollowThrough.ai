import type { ActorContext } from '$lib/models/identity';
import type { Provenance, ProvenanceId } from '$lib/models/provenance';
export interface ProvenanceRepository {
	findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined>;
	insert(actor: ActorContext, provenance: Provenance): Promise<Provenance>;
}
