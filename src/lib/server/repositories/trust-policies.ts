import type { ActorContext, PipelineKind, TrustPolicy } from '$lib/models';
export interface TrustPolicyRepository {
	find(actor: ActorContext, pipeline: PipelineKind): Promise<TrustPolicy | undefined>;
	list(actor: ActorContext): Promise<readonly TrustPolicy[]>;
	upsert(actor: ActorContext, policy: TrustPolicy): Promise<TrustPolicy>;
}
