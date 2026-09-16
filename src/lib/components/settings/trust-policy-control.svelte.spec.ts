import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
import type { Confidence } from '$lib/models/provenance';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import TrustPolicyControl from './trust-policy-control.svelte';

const policy: TrustPolicy = {
	userId: testActor().userId,
	pipeline: 'memory',
	autoAcceptEnabled: false,
	minimumConfidence: 80 as Confidence,
	createdAt: testNow,
	updatedAt: testNow
};

it('retains the configured confidence when enabling memory proposal acceptance', async () => {
	const changes: UpdateTrustPolicyInput[] = [];
	const screen = await render(TrustPolicyControl, {
		policy,
		onchange: (input) => {
			changes.push(input);
		}
	});
	await screen.getByRole('radio', { name: 'Auto-accept', exact: true }).click();
	expect(changes).toEqual([{ pipeline: 'memory', autoAcceptEnabled: true, minimumConfidence: 80 }]);
});

it('describes the inclusive confidence threshold used by the evaluator', async () => {
	const screen = await render(TrustPolicyControl, {
		policy: { ...policy, autoAcceptEnabled: true }
	});
	await expect.element(screen.getByText(/Auto-accepts at or above 80% confidence/)).toBeVisible();
});
