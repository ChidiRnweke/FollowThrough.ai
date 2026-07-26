<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { updateTrustPolicy } from '$lib/remote/settings.remote';
	import TrustPolicyControl from '../trust-policy-control.svelte';

	let { policies }: { policies: readonly TrustPolicy[] } = $props();
	let busy = $state(false);

	async function change(input: UpdateTrustPolicyInput): Promise<void> {
		busy = true;
		try {
			await updateTrustPolicy(input);
			// The policies come from the page load, so that is what has to be re-read.
			await invalidateAll();
			toast.success('Policy updated');
		} catch {
			toast.error('Could not update the policy. Try again.');
		} finally {
			busy = false;
		}
	}
</script>

<section class="space-y-3">
	<h2 class="section-title">Trust policies</h2>
	<p class="text-sm text-muted-foreground">
		Decide per pipeline whether accepted work needs your review first. Trust is earned one pipeline
		at a time.
	</p>
	{#if policies.length === 0}
		<p class="text-sm text-muted-foreground">No policies configured yet.</p>
	{:else}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each policies as policy (policy.pipeline)}
				<TrustPolicyControl {policy} disabled={busy} onchange={(input) => void change(input)} />
			{/each}
		</div>
	{/if}
</section>
