import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { PipelineKind, TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
import { PROPOSAL_AUTO_ACCEPT_PIPELINES } from '$lib/models/agent';
import { ValidationError } from '$lib/errors';
import type { Suggestion } from '$lib/models/suggestions';
import type { TrustPolicyRepository } from '$lib/server/repositories/agent';
export interface TrustPolicyEvaluator {
	shouldAutoAccept(
		actor: ActorContext,
		pipeline: PipelineKind,
		suggestion: Suggestion
	): Promise<boolean>;
}
export interface TrustPolicyStore {
	list(actor: ActorContext): Promise<readonly TrustPolicy[]>;
	upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy>;
}

const supported = new Set<PipelineKind>(PROPOSAL_AUTO_ACCEPT_PIPELINES);
const now = (): DateTime => new Date().toISOString() as DateTime;

export class ToolTrust implements TrustPolicyStore, TrustPolicyEvaluator {
	constructor(private readonly policies: TrustPolicyRepository) {}
	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		const stored = new Map(
			(await this.policies.list(actor)).map((policy) => [policy.pipeline, policy])
		);
		return PROPOSAL_AUTO_ACCEPT_PIPELINES.map(
			(pipeline) =>
				stored.get(pipeline) ?? {
					userId: actor.userId,
					pipeline,
					autoAcceptEnabled: false,
					createdAt: now(),
					updatedAt: now()
				}
		);
	}
	async upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy> {
		if (!supported.has(input.pipeline))
			throw new ValidationError(
				'Auto-accept policies apply only to extracted tasks and memory proposals. Chat tool approvals use the chat execution mode; note links and external references require review.'
			);
		const existing = await this.policies.find(actor, input.pipeline);
		const timestamp = now();
		return this.policies.upsert(actor, {
			userId: actor.userId,
			pipeline: input.pipeline,
			autoAcceptEnabled: input.autoAcceptEnabled,
			...(input.minimumConfidence !== undefined
				? { minimumConfidence: input.minimumConfidence }
				: {}),
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp
		});
	}
	async shouldAutoAccept(
		actor: ActorContext,
		pipeline: PipelineKind,
		suggestion: Suggestion
	): Promise<boolean> {
		if (!supported.has(pipeline)) return false;
		const policy = (await this.list(actor)).find((item) => item.pipeline === pipeline);
		return Boolean(
			policy?.autoAcceptEnabled &&
			(policy.minimumConfidence === undefined ||
				(suggestion.confidence ?? 0) >= policy.minimumConfidence)
		);
	}
}
