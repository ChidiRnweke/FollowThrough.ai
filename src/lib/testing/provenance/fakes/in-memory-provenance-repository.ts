import type { ActorContext } from '$lib/models/identity';
import type { Provenance, ProvenanceId } from '$lib/models/provenance';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance/provenance';

export class InMemoryProvenanceRepository implements ProvenanceRepository {
	provenance: Provenance[] = [];
	async findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined> {
		return this.provenance.find((item) => item.id === id && item.userId === actor.userId);
	}
	async insert(_actor: ActorContext, provenance: Provenance): Promise<Provenance> {
		this.provenance.push(provenance);
		return provenance;
	}
}
