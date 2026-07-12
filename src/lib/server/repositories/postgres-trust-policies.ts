import { and, eq } from 'drizzle-orm';
import type { ActorContext, PipelineKind, TrustPolicy } from '$lib/models';
import type { TrustPolicyRepository } from '$lib/repositories/trust-policies';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toTrustPolicy } from '../domain/mappers';

export class PostgresTrustPolicyRepository implements TrustPolicyRepository {
	constructor(private readonly database: Database) {}
	async find(actor: ActorContext, pipeline: PipelineKind): Promise<TrustPolicy | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.trustPolicies)
			.where(
				and(
					eq(schema.trustPolicies.userId, actor.userId),
					eq(schema.trustPolicies.pipeline, pipeline)
				)
			);
		return row ? toTrustPolicy(row) : undefined;
	}
	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		return (
			await this.database
				.select()
				.from(schema.trustPolicies)
				.where(eq(schema.trustPolicies.userId, actor.userId))
		).map(toTrustPolicy);
	}
	async upsert(actor: ActorContext, policy: TrustPolicy): Promise<TrustPolicy> {
		const [row] = await this.database
			.insert(schema.trustPolicies)
			.values({
				userId: actor.userId,
				pipeline: policy.pipeline,
				autoAcceptEnabled: policy.autoAcceptEnabled,
				minimumConfidence: policy.minimumConfidence,
				conditions: policy.conditions as Record<string, unknown>,
				createdAt: new Date(policy.createdAt),
				updatedAt: new Date(policy.updatedAt)
			})
			.onConflictDoUpdate({
				target: [schema.trustPolicies.userId, schema.trustPolicies.pipeline],
				set: {
					autoAcceptEnabled: policy.autoAcceptEnabled,
					minimumConfidence: policy.minimumConfidence,
					conditions: policy.conditions as Record<string, unknown>,
					updatedAt: new Date(policy.updatedAt)
				}
			})
			.returning();
		return toTrustPolicy(row!);
	}
}
