import type {
	ActorContext,
	DateTime,
	PipelineKind,
	Suggestion,
	TrustPolicy,
	UpdateTrustPolicyInput
} from '$lib/models';
import type { TrustPolicyRepository } from '$lib/server/repositories';
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

const pipelines: readonly PipelineKind[] = [
	'extract_promises',
	'relate',
	'reference',
	'agent',
	'memory'
];
const now = (): DateTime => new Date().toISOString() as DateTime;

export class ToolTrust implements TrustPolicyStore, TrustPolicyEvaluator {
	constructor(private readonly policies: TrustPolicyRepository) {}
	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		const stored = new Map(
			(await this.policies.list(actor)).map((policy) => [policy.pipeline, policy])
		);
		return pipelines.map(
			(pipeline) =>
				stored.get(pipeline) ?? {
					userId: actor.userId,
					pipeline,
					autoAcceptEnabled: false,
					conditions: {},
					createdAt: now(),
					updatedAt: now()
				}
		);
	}
	async upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy> {
		const existing = await this.policies.find(actor, input.pipeline);
		const timestamp = now();
		return this.policies.upsert(actor, {
			userId: actor.userId,
			pipeline: input.pipeline,
			autoAcceptEnabled: input.autoAcceptEnabled,
			...(input.minimumConfidence !== undefined
				? { minimumConfidence: input.minimumConfidence }
				: {}),
			conditions: existing?.conditions ?? {},
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp
		});
	}
	async shouldAutoAccept(
		actor: ActorContext,
		pipeline: PipelineKind,
		suggestion: Suggestion
	): Promise<boolean> {
		if (pipeline === 'reference') return false;
		const policy = (await this.list(actor)).find((item) => item.pipeline === pipeline);
		return Boolean(
			policy?.autoAcceptEnabled &&
			(policy.minimumConfidence === undefined ||
				(suggestion.confidence ?? 0) >= policy.minimumConfidence)
		);
	}
}
