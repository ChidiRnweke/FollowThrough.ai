import { and, eq } from 'drizzle-orm';
import type { ActorContext, Provenance, ProvenanceId } from '$lib/models';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toProvenance } from '$lib/server/db/mappers';

export class ProvenanceRecords implements ProvenanceRepository {
	constructor(private readonly database: Database) {}
	async findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.provenance)
			.where(and(eq(schema.provenance.id, id), eq(schema.provenance.userId, actor.userId)));
		return row ? toProvenance(row) : undefined;
	}
	async insert(actor: ActorContext, provenance: Provenance): Promise<Provenance> {
		const [row] = await this.database
			.insert(schema.provenance)
			.values({
				id: provenance.id,
				userId: actor.userId,
				producerKind: provenance.producerKind,
				producerName: provenance.producerName,
				pipeline: provenance.pipeline,
				sourceAnchorId: provenance.sourceAnchorId,
				runId: provenance.runId,
				model: provenance.model,
				metadata: provenance.metadata as Record<string, unknown>,
				createdAt: new Date(provenance.createdAt)
			})
			.returning();
		return toProvenance(row!);
	}
}
