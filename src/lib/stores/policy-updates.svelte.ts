import { invalidateAll } from '$app/navigation';
import type { UpdateTrustPolicyInput } from '$lib/models';

class PolicyUpdatesStore {
	busy = $state(false);

	async update(input: UpdateTrustPolicyInput): Promise<boolean> {
		this.busy = true;
		try {
			const response = await fetch('/api/trust-policies', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input)
			});
			if (response.ok) await invalidateAll();
			return response.ok;
		} catch {
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export const policyUpdates = new PolicyUpdatesStore();
