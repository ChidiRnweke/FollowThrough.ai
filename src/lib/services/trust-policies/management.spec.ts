import { describe, expect, it } from 'vitest';
import { TrustPolicyManagementService } from './management';
import { InMemoryTrustPolicyRepository } from '$lib/testing/fakes/in-memory-trust-policy-repository';
import { suggestionBuilder, testActor, testNow } from '$lib/testing/fixtures/domain-builders';

describe('Trust policy invariants', () => {
	it('returns a default policy for every pipeline', async () => {
		const service = new TrustPolicyManagementService(new InMemoryTrustPolicyRepository());
		expect(await service.list(testActor())).toHaveLength(5);
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
		const service = new TrustPolicyManagementService(repository);
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
		const service = new TrustPolicyManagementService(repository);
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
		const service = new TrustPolicyManagementService(repository);
		await service.upsert(testActor(), {
			pipeline: 'extract_promises',
			autoAcceptEnabled: true
		});
		expect(await service.shouldAutoAccept(testActor(), 'agent', suggestionBuilder())).toBe(false);
	});
});
