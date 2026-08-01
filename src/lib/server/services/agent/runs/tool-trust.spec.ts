import { describe, expect, it } from 'vitest';
import { ToolTrust } from './tool-trust';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import {
	suggestionBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('Trust policy invariants', () => {
	it('returns a default policy for every pipeline', async () => {
		const service = new ToolTrust(new InMemoryTrustPolicyRepository());
		expect(await service.list(testActor())).toHaveLength(5);
	});
	it('includes a memory pipeline policy', async () => {
		const service = new ToolTrust(new InMemoryTrustPolicyRepository());
		expect((await service.list(testActor())).some((policy) => policy.pipeline === 'memory')).toBe(
			true
		);
	});
	it('never auto-accepts references', async () => {
		const repository = new InMemoryTrustPolicyRepository();
		repository.policies = [
			{
				userId: testActor().userId,
				pipeline: 'reference',
				autoAcceptEnabled: true,
				conditions: {},
				createdAt: testNow,
				updatedAt: testNow
			}
		];
		const service = new ToolTrust(repository);
		expect(await service.shouldAutoAccept(testActor(), 'reference', suggestionBuilder())).toBe(
			false
		);
	});
	it('requires the configured confidence threshold', async () => {
		const repository = new InMemoryTrustPolicyRepository();
		repository.policies = [
			{
				userId: testActor().userId,
				pipeline: 'relate',
				autoAcceptEnabled: true,
				minimumConfidence: 80 as never,
				conditions: {},
				createdAt: testNow,
				updatedAt: testNow
			}
		];
		const service = new ToolTrust(repository);
		expect(
			await service.shouldAutoAccept(
				testActor(),
				'relate',
				suggestionBuilder({ confidence: 70 as never })
			)
		).toBe(false);
	});

	it('does not reuse another pipeline policy', async () => {
		const repository = new InMemoryTrustPolicyRepository();
		const service = new ToolTrust(repository);
		await service.upsert(testActor(), {
			pipeline: 'extract_promises',
			autoAcceptEnabled: true
		});
		expect(await service.shouldAutoAccept(testActor(), 'agent', suggestionBuilder())).toBe(false);
	});
});
