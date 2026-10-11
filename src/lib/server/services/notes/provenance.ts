import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Provenance, ProvenanceId, ProvenanceRequest } from '$lib/models/provenance';
import { NotFoundError } from '$lib/errors';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
export interface ProvenanceRecorder {
	record(input: ProvenanceRequest): Promise<Provenance>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

export class NoteProvenance implements ProvenanceRecorder {
	constructor(
		private readonly actor: ActorContext,
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository
	) {}
	async record(input: ProvenanceRequest): Promise<Provenance> {
		if (input.sourceAnchorId && !(await this.anchors.findById(input.sourceAnchorId)))
			throw new NotFoundError('Provenance source anchor was not found');
		return this.provenance.insert({
			...input,
			id: crypto.randomUUID() as ProvenanceId,
			userId: this.actor.userId,
			createdAt: now()
		});
	}
}
