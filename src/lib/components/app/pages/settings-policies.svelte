<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { policyUpdates } from '$lib/stores/policy-updates.svelte';
	import TrustPolicyControl from '../trust-policy-control.svelte';

	let { policies }: { policies: readonly TrustPolicy[] } = $props();

	async function change(input: UpdateTrustPolicyInput): Promise<void> {
		const ok = await policyUpdates.update(input);
		if (ok) toast.success('Policy updated');
		else toast.error('Could not update the policy. Try again.');
	}
</script>

<section class="space-y-3">
	<h2 class="text-sm font-semibold">Trust policies</h2>
	<p class="text-sm text-muted-foreground">
		Decide per pipeline whether accepted work needs your review first. Trust is earned one pipeline
		at a time.
	</p>
	{#if policies.length === 0}
		<p class="text-sm text-muted-foreground">No policies configured yet.</p>
	{:else}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each policies as policy (policy.pipeline)}
				<TrustPolicyControl
					{policy}
					disabled={policyUpdates.busy}
					onchange={(input) => void change(input)}
				/>
			{/each}
		</div>
	{/if}
</section>
