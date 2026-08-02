import type { ActorContext } from '$lib/models/identity';
import type { PipelineKind, TrustPolicy } from '$lib/models/agent';
/** One row per `(user, pipeline)`; `upsert` replaces the prior rule outright rather than merging it. */
export interface TrustPolicyRepository {
	find(actor: ActorContext, pipeline: PipelineKind): Promise<TrustPolicy | undefined>;
	list(actor: ActorContext): Promise<readonly TrustPolicy[]>;
	upsert(actor: ActorContext, policy: TrustPolicy): Promise<TrustPolicy>;
}
