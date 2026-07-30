import type { ActorContext, Provenance, ProvenanceId } from '$lib/models';
export interface ProvenanceRepository {
	findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined>;
	insert(actor: ActorContext, provenance: Provenance): Promise<Provenance>;
}
