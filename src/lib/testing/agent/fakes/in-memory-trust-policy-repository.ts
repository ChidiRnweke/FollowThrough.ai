import type { ActorContext } from '$lib/models/identity';
import type { PipelineKind, TrustPolicy } from '$lib/models/agent';
import type { TrustPolicyRepository } from '$lib/server/repositories/agent/trust-policies';

export class InMemoryTrustPolicyRepository implements TrustPolicyRepository {
	constructor(private readonly actor: ActorContext) {}
	policies: TrustPolicy[] = [];
	async find(pipeline: PipelineKind): Promise<TrustPolicy | undefined> {
		return this.policies.find(
			(policy) => policy.userId === this.actor.userId && policy.pipeline === pipeline
		);
	}
	async list(): Promise<readonly TrustPolicy[]> {
		return this.policies.filter((policy) => policy.userId === this.actor.userId);
	}
	async upsert(policy: TrustPolicy): Promise<TrustPolicy> {
		this.policies = [
			...this.policies.filter(
				(item) => !(item.userId === policy.userId && item.pipeline === policy.pipeline)
			),
			policy
		];
		return policy;
	}
}
