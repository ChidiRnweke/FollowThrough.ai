import type { ActorContext } from '$lib/models/identity';
import type {
	GetTrustPoliciesOutput,
	UpdateTrustPolicyInput,
	UpdateTrustPolicyOutput
} from '$lib/models/agent';
import type { TrustPolicyStore } from '$lib/server/services/agent/runs/tool-trust';

/**
 * Application boundary for trust policies: the rules deciding which agent tool calls and
 * suggestion types are auto-approved versus gated on explicit user approval.
 */
export interface TrustPoliciesController {
	/** List the current trust policies. */
	list(actor: ActorContext): Promise<GetTrustPoliciesOutput>;
	/** Upsert a trust policy, replacing the previous rule for the same scope and tool. */
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
