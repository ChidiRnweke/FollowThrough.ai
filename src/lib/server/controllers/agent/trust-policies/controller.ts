import type { AtomicOperation } from '$lib/models/workspace';
import type {
	TrustPolicyMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import { ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type {
	GetTrustPoliciesOutput,
	UpdateTrustPolicyInput,
	UpdateTrustPolicyOutput
} from '$lib/models/agent';
import type { TrustPolicyStore } from '$lib/server/services/agent/runs/tool-trust';

/**
 * Application boundary for auto-accepting extracted task and memory proposals.
 * Chat tool approval is controlled separately by execution mode.
 */
export interface TrustPoliciesController {
	synchronize(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<WorkspaceMutationResult>;
	/** List the current trust policies. */
	list(actor: ActorContext): Promise<GetTrustPoliciesOutput>;
	/** Replace the user's auto-accept rule for one supported proposal workflow. */
	update(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput>;
}
export interface TrustPoliciesDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	transactionRunner: AtomicOperation;
	syncRetry: 'database-only' | 'never';
	trustPolicyStore: TrustPolicyStore;
}
export class TrustPolicies implements TrustPoliciesController {
	async synchronize(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const prepared = await this.dependencies.syncMutations.prepare(actor, input);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<void> {
		if (input.command.userId !== actor.userId)
			throw new ValidationError('The preferences belong to another account');
		await this.update(actor, input.command);
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
