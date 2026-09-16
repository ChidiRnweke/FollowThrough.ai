import { describe, expect, it } from 'vitest';
import { ToolTrust } from './tool-trust';
import { InMemoryTrustPolicyRepository } from '$lib/testing/agent/fakes/in-memory-trust-policy-repository';
import {
	suggestionBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('Trust policy invariants', () => {
	it('lists only proposal workflows with effective auto-accept behavior', async () => {
		const service = new ToolTrust(new InMemoryTrustPolicyRepository());
		expect((await service.list(testActor())).map((policy) => policy.pipeline)).toEqual([
			'extract_promises',
			'memory'
		]);
	});
	it.each(['relate', 'reference', 'agent'] as const)(
		'rejects changes to the ineffective %s policy',
		async (pipeline) => {
			const service = new ToolTrust(new InMemoryTrustPolicyRepository());
			await expect(
				service.upsert(testActor(), { pipeline, autoAcceptEnabled: true })
			).rejects.toMatchObject({ code: 'VALIDATION' });
		}
	);
	it.each(['relate', 'reference', 'agent'] as const)(
		'does not authorize acceptance through a legacy %s setting',
		async (pipeline) => {
			const repository = new InMemoryTrustPolicyRepository();
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
				await new ToolTrust(repository).shouldAutoAccept(testActor(), pipeline, suggestionBuilder())
			).toBe(false);
		}
	);
	it('preserves historical policy records without presenting them as effective controls', async () => {
		const repository = new InMemoryTrustPolicyRepository();
		const legacy = {
			userId: testActor().userId,
			pipeline: 'agent' as const,
			autoAcceptEnabled: true,
			createdAt: testNow,
			updatedAt: testNow
		};
		repository.policies = [legacy];
		await new ToolTrust(repository).list(testActor());
		expect(repository.policies).toEqual([legacy]);
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
				pipeline: 'extract_promises',
				autoAcceptEnabled: true,
				minimumConfidence: 80 as never,
				createdAt: testNow,
				updatedAt: testNow
			}
		];
		const service = new ToolTrust(repository);
		expect(
			await service.shouldAutoAccept(
				testActor(),
				'extract_promises',
				suggestionBuilder({ confidence: 70 as never })
			)
		).toBe(false);
	});
	it('accepts a supported proposal exactly at the confidence threshold', async () => {
		const service = new ToolTrust(new InMemoryTrustPolicyRepository());
		await service.upsert(testActor(), {
			pipeline: 'extract_promises',
			autoAcceptEnabled: true,
			minimumConfidence: 80 as never
		});
		expect(
			await service.shouldAutoAccept(
				testActor(),
				'extract_promises',
				suggestionBuilder({ confidence: 80 as never })
			)
		).toBe(true);
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
