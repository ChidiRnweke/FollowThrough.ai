import type { PipelineKind, TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { TrustPolicies, type TrustPoliciesDependencies } from './controller';

const policy = (overrides: Partial<TrustPolicy> = {}): TrustPolicy => ({
	userId: testActor().userId,
	pipeline: 'extract_promises',
	autoAcceptEnabled: false,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

describe('trust policy controller behavior', () => {
	it('returns the actor’s policy collection', async () => {
		const repository = new InMemoryTrustPolicyRepository();
		repository.policies = [
			policy({ userId: testActor(2).userId, autoAcceptEnabled: true }),
			policy()
		];
		const trustPolicyStore = new ToolTrust(repository);
		const controller = new TrustPolicies(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<TrustPoliciesDependencies>({
				...agentToolResultsFixture(),
				trustPolicyStore
			})
		);
		expect(
			(await controller.list(testActor())).policies.map(({ pipeline, autoAcceptEnabled }) => ({
				pipeline,
				autoAcceptEnabled
			}))
		).toEqual([
			{ pipeline: 'extract_promises', autoAcceptEnabled: false },
			{ pipeline: 'memory', autoAcceptEnabled: false }
		]);
	});

	it('returns the updated policy', async () => {
		const trustPolicyStore = new ToolTrust(new InMemoryTrustPolicyRepository());
		const controller = new TrustPolicies(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<TrustPoliciesDependencies>({
				...agentToolResultsFixture(),
				trustPolicyStore
			})
		);
		const input: UpdateTrustPolicyInput = {
			pipeline: 'extract_promises' as PipelineKind,
			autoAcceptEnabled: true
		};
		const result = await controller.update(testActor(), input);
		expect(result.policy.autoAcceptEnabled).toBe(true);
	});
});
