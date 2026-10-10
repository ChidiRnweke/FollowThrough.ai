import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
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
	synchronize(
		actor: ActorContext,
		input: TrustPolicyMutationRequest
	): Promise<WorkspaceMutationResult>;
	/** List the current trust policies. */
	list(actor: ActorContext): Promise<GetTrustPoliciesOutput>;
	/** Replace the user's auto-accept rule for one supported proposal workflow. */
	update(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<UpdateTrustPolicyOutput>;

	agentListTrustPolicies(
		actor: ActorContext,
		input: AgentToolInput<'list_trust_policies'>
	): Promise<AgentPayload>;
	agentUpdateTrustPolicy(
		actor: ActorContext,
		input: AgentToolInput<'update_trust_policy'>
	): Promise<AgentPayload>;
}
export interface TrustPoliciesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	syncMutations: WorkspaceMutationGuard;
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
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
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
	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: TrustPoliciesDependencies
	) {}
	async list(actor: ActorContext): Promise<GetTrustPoliciesOutput> {
		return { policies: await this.dependencies.trustPolicyStore.list(actor) };
	}
	async update(
		actor: ActorContext,
		input: UpdateTrustPolicyInput
	): Promise<UpdateTrustPolicyOutput> {
		return { policy: await this.dependencies.trustPolicyStore.upsert(actor, input) };
	}

	async agentListTrustPolicies(
		actor: ActorContext,
		input: AgentToolInput<'list_trust_policies'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.list(actor);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentUpdateTrustPolicy(
		actor: ActorContext,
		input: AgentToolInput<'update_trust_policy'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.update(actor, input);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
