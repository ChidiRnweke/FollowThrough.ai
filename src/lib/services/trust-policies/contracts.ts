import type {
	ActorContext,
	PipelineKind,
	Suggestion,
	TrustPolicy,
	UpdateTrustPolicyInput
} from '$lib/models';

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
