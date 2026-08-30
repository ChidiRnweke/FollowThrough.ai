import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import {
	asProvenance,
	type Provenance,
	type ProvenanceId,
	type ProvenanceRequest
} from '$lib/models/provenance';
import { NotFoundError } from '$lib/errors';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
export interface ProvenanceRecorder {
	record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

export class NoteProvenance implements ProvenanceRecorder {
	constructor(
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository
	) {}
	async record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance> {
		if (input.sourceAnchorId && !(await this.anchors.findById(actor, input.sourceAnchorId)))
			throw new NotFoundError('Provenance source anchor was not found');
		return this.provenance.insert(
			actor,
			asProvenance(input, {
				id: crypto.randomUUID() as ProvenanceId,
				userId: actor.userId,
				createdAt: now()
			})
		);
	}
}
