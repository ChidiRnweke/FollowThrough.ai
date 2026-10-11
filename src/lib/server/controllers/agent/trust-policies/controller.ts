import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { ValidationError } from '$lib/errors';
import type {
	GetTrustPoliciesOutput,
	UpdateTrustPolicyInput,
	UpdateTrustPolicyOutput
} from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation } from '$lib/models/workspace';
import type {
	TrustPolicyMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { TrustPolicyStore } from '$lib/server/services/agent/runs/tool-trust';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for auto-accepting extracted task and memory proposals.
 * Chat tool approval is controlled separately by execution mode.
 */
export interface TrustPoliciesController {
	synchronize(input: TrustPolicyMutationRequest): Promise<WorkspaceMutationResult>;
	/** List the current trust policies. */
	list(): Promise<GetTrustPoliciesOutput>;
	/** Replace the user's auto-accept rule for one supported proposal workflow. */
	update(input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput>;
}
export interface TrustPoliciesDependencies {
	syncMutations: WorkspaceMutationGuard;
	transactionRunner: AtomicOperation;
	syncRetry: 'database-only' | 'never';
	trustPolicyStore: TrustPolicyStore;
}
export class TrustPolicies implements TrustPoliciesController {
	async synchronize(input: TrustPolicyMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: TrustPolicyMutationRequest): Promise<void> {
		if (input.command.userId !== this.actor.userId)
			throw new ValidationError('The preferences belong to another account');
		await this.update(input.command);
	}
	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: TrustPoliciesDependencies
	) {}
	async list(): Promise<GetTrustPoliciesOutput> {
		return { policies: await this.dependencies.trustPolicyStore.list() };
	}
	async update(input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput> {
		return { policy: await this.dependencies.trustPolicyStore.upsert(input) };
	}
}
