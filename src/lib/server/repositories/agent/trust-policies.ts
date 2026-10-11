import type { ActorContext } from '$lib/models/identity';
import type { PipelineKind, TrustPolicy } from '$lib/models/agent';
/** One row per `(user, pipeline)`; `upsert` replaces the prior rule outright rather than merging it. */
export interface TrustPolicyRepository {
	find(pipeline: PipelineKind): Promise<TrustPolicy | undefined>;
	list(): Promise<readonly TrustPolicy[]>;
	upsert(policy: TrustPolicy): Promise<TrustPolicy>;
}
