import { describe, expect, it } from 'vitest';
import { ToolTrust } from './tool-trust';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import {
	suggestionBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('Trust policy invariants', () => {
	it.each(['agent'] as const)('rejects changes to the ineffective %s policy', async (pipeline) => {
		const service = new ToolTrust(testActor(), new InMemoryTrustPolicyRepository(testActor()));
		await expect(service.upsert({ pipeline, autoAcceptEnabled: true })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it.each(['agent'] as const)(
		'does not authorize acceptance through a legacy %s setting',
		async (pipeline) => {
			const repository = new InMemoryTrustPolicyRepository(testActor());
			repository.policies = [
				{
					userId: testActor().userId,
					pipeline,
					autoAcceptEnabled: true,
					createdAt: testNow,
					updatedAt: testNow
				}
			];
			expect(
				await new ToolTrust(testActor(), repository).shouldAutoAccept(pipeline, suggestionBuilder())
			).toBe(false);
		}
	);
	it('preserves historical policy records without presenting them as effective controls', async () => {
		const repository = new InMemoryTrustPolicyRepository(testActor());
		const legacy = {
			userId: testActor().userId,
			pipeline: 'agent' as const,
			autoAcceptEnabled: true,
			createdAt: testNow,
			updatedAt: testNow
		};
		repository.policies = [legacy];
		await new ToolTrust(testActor(), repository).list();
		expect(repository.policies).toEqual([legacy]);
	});
	it('requires the configured confidence threshold', async () => {
		const repository = new InMemoryTrustPolicyRepository(testActor());
		repository.policies = [
			{
				userId: testActor().userId,
				pipeline: 'extract_promises',
				autoAcceptEnabled: true,
				minimumConfidence: 80 as never,
				createdAt: testNow,
				updatedAt: testNow
			}
		];
		const service = new ToolTrust(testActor(), repository);
		expect(
			await service.shouldAutoAccept(
				'extract_promises',
				suggestionBuilder({ confidence: 70 as never })
			)
		).toBe(false);
	});
	it('accepts a supported proposal exactly at the confidence threshold', async () => {
		const service = new ToolTrust(testActor(), new InMemoryTrustPolicyRepository(testActor()));
		await service.upsert({
			pipeline: 'extract_promises',
			autoAcceptEnabled: true,
			minimumConfidence: 80 as never
		});
		expect(
			await service.shouldAutoAccept(
				'extract_promises',
				suggestionBuilder({ confidence: 80 as never })
			)
		).toBe(true);
	});

	it('does not reuse another pipeline policy', async () => {
		const repository = new InMemoryTrustPolicyRepository(testActor());
		const service = new ToolTrust(testActor(), repository);
		await service.upsert({
			pipeline: 'extract_promises',
			autoAcceptEnabled: true
		});
		expect(await service.shouldAutoAccept('agent', suggestionBuilder())).toBe(false);
	});
});
