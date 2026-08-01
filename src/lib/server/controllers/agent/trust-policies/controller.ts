import type { ActorContext } from '$lib/models/identity';
import type {
	GetTrustPoliciesOutput,
	UpdateTrustPolicyInput,
	UpdateTrustPolicyOutput
} from '$lib/models/agent';
import type { TrustPolicyStore } from '$lib/server/services/agent/runs/tool-trust';

export interface TrustPoliciesController {
	list(actor: ActorContext): Promise<GetTrustPoliciesOutput>;
	update(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput>;
}
export interface TrustPoliciesDependencies {
	trustPolicyStore: TrustPolicyStore;
}
export class TrustPolicies implements TrustPoliciesController {
	constructor(private readonly dependencies: TrustPoliciesDependencies) {}
	async list(actor: ActorContext): Promise<GetTrustPoliciesOutput> {
		return { policies: await this.dependencies.trustPolicyStore.list(actor) };
	}
	async update(
		actor: ActorContext,
		input: UpdateTrustPolicyInput
	): Promise<UpdateTrustPolicyOutput> {
		return { policy: await this.dependencies.trustPolicyStore.upsert(actor, input) };
	}
}
