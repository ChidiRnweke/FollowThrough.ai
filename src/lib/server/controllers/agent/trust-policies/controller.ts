import type {
	TrustPolicyMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { SyncMutationTransactions } from '$lib/server/services/workspace/mutations';
import { ValidationError } from '$lib/errors';
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
	synchronize(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<WorkspaceMutationResult>;
	/** List the current trust policies. */
	list(actor: ActorContext): Promise<GetTrustPoliciesOutput>;
	/** Upsert a trust policy, replacing the previous rule for the same scope and tool. */
	update(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput>;
}
export interface TrustPoliciesDependencies {
	syncMutations: Pick<SyncMutationTransactions, 'run'>;
	trustPolicyStore: TrustPolicyStore;
}
export class TrustPolicies implements TrustPoliciesController {
	synchronize(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<WorkspaceMutationResult> {
		return this.dependencies.syncMutations.run(actor, input, async () => {
			if (input.command.userId !== actor.userId)
				throw new ValidationError('The preferences belong to another account');
			await this.update(actor, input.command);
		});
	}
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
