import type { ActorContext } from '$lib/models/identity';
import { provenanceSchema, type Provenance, type ProvenanceId } from '$lib/models/provenance';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance/provenance';

export class InMemoryProvenanceRepository implements ProvenanceRepository {
	provenance: Provenance[] = [];
	async findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined> {
		return this.provenance.find((item) => item.id === id && item.userId === actor.userId);
	}
	async insert(actor: ActorContext, provenance: Provenance): Promise<Provenance> {
		const stored = provenanceSchema.parse({ ...provenance, userId: actor.userId });
		this.provenance.push(stored);
		return stored;
	}
}
