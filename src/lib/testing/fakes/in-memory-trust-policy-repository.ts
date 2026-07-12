import type { ActorContext, PipelineKind, TrustPolicy } from '$lib/models';
import type { TrustPolicyRepository } from '$lib/repositories/trust-policies';

export class InMemoryTrustPolicyRepository implements TrustPolicyRepository {
	policies: TrustPolicy[] = [];
	async find(actor: ActorContext, pipeline: PipelineKind): Promise<TrustPolicy | undefined> {
		return this.policies.find(
			(policy) => policy.userId === actor.userId && policy.pipeline === pipeline
		);
	}
	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		return this.policies.filter((policy) => policy.userId === actor.userId);
	}
	async upsert(_actor: ActorContext, policy: TrustPolicy): Promise<TrustPolicy> {
		this.policies = [
			...this.policies.filter(
				(item) => !(item.userId === policy.userId && item.pipeline === policy.pipeline)
			),
			policy
		];
		return policy;
	}
}
