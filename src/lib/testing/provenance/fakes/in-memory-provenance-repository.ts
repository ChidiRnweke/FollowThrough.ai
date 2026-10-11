import type { ActorContext } from '$lib/models/identity';
import { provenanceSchema, type Provenance, type ProvenanceId } from '$lib/models/provenance';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance/provenance';

export class InMemoryProvenanceRepository implements ProvenanceRepository {
	constructor(private readonly actor: ActorContext) {}
	snapshot(): () => void {
		const provenance = [...this.provenance];
		return () => {
			this.provenance = provenance;
		};
	}

	provenance: Provenance[] = [];
	async findById(id: ProvenanceId): Promise<Provenance | undefined> {
		return this.provenance.find((item) => item.id === id && item.userId === this.actor.userId);
	}
	async insert(provenance: Provenance): Promise<Provenance> {
		const stored = provenanceSchema.parse({ ...provenance, userId: this.actor.userId });
		this.provenance.push(stored);
		return stored;
	}
}
