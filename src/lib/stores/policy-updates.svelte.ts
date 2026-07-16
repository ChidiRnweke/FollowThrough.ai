import { invalidateAll } from '$app/navigation';
import type { UpdateTrustPolicyInput } from '$lib/models';

class PolicyUpdatesStore {
	busy = $state(false);

	async update(input: UpdateTrustPolicyInput): Promise<boolean> {
		this.busy = true;
		try {
			const formData = new FormData();
			formData.set('pipeline', input.pipeline);
			formData.set('autoAcceptEnabled', String(input.autoAcceptEnabled));
			if (input.minimumConfidence !== undefined)
				formData.set('minimumConfidence', String(input.minimumConfidence));
			const response = await fetch('?/updateTrustPolicy', { method: 'POST', body: formData });
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
