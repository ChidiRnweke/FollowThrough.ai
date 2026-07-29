import { describe, expect, it } from 'vitest';
import type { ActorContext, PipelineKind, TrustPolicy, UpdateTrustPolicyInput } from '$lib/models';
import type { TrustPolicyStore } from '$lib/services';
import { testActor, testNow } from '$lib/testing/fixtures/domain-builders';
import { DefaultTrustPoliciesController } from './controller';

const policy = (overrides: Partial<TrustPolicy> = {}): TrustPolicy => ({
	userId: testActor().userId,
	pipeline: 'extract_promises',
	autoAcceptEnabled: false,
	conditions: {},
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

class FakeTrustPolicyStore implements TrustPolicyStore {
	policies: TrustPolicy[] = [policy()];

	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		return this.policies.filter((candidate) => candidate.userId === actor.userId);
	}

	async upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy> {
		const updated = policy({
			userId: actor.userId,
			pipeline: input.pipeline,
			autoAcceptEnabled: input.autoAcceptEnabled,
			minimumConfidence: input.minimumConfidence,
			conditions: input.conditions ?? {}
		});
		this.policies = [
			...this.policies.filter(
				(candidate) => candidate.userId !== actor.userId || candidate.pipeline !== input.pipeline
			),
			updated
		];
		return updated;
	}
}

describe('trust policy controller behavior', () => {
	it('returns the actor’s policy collection', async () => {
		const trustPolicyStore = new FakeTrustPolicyStore();
		const controller = new DefaultTrustPoliciesController({ trustPolicyStore });
		expect(await controller.list(testActor())).toEqual({ policies: [policy()] });
	});

	it('returns the updated policy', async () => {
		const trustPolicyStore = new FakeTrustPolicyStore();
		const controller = new DefaultTrustPoliciesController({ trustPolicyStore });
		const input: UpdateTrustPolicyInput = {
			pipeline: 'extract_promises' as PipelineKind,
			autoAcceptEnabled: true,
			conditions: {}
		};
		const result = await controller.update(testActor(), input);
		expect(result.policy.autoAcceptEnabled).toBe(true);
	});
});
