import type { ActorContext, DateTime, Provenance, ProvenanceId } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { ProvenanceRepository, SourceAnchorRepository } from '$lib/repositories';
import type { ProvenanceRecorder } from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class ProvenanceManagementService implements ProvenanceRecorder {
	constructor(
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository
	) {}
	async record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance> {
		if (input.sourceAnchorId && !(await this.anchors.findById(actor, input.sourceAnchorId)))
			throw new NotFoundError('Provenance source anchor was not found');
		return this.provenance.insert(actor, {
			id: crypto.randomUUID() as ProvenanceId,
			userId: actor.userId,
			...input,
			createdAt: now()
		});
	}
}
