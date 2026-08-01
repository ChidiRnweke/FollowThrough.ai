<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { updateTrustPolicy } from '$lib/remote/settings/settings.remote';
	import TrustPolicyControl from '../trust-policy-control.svelte';
	import * as Field from '$lib/components/ui/field';

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

<section class="flex max-w-3xl flex-col gap-6">
	<!-- The pb-2 steps the preamble out to 32px so it does not read as a caption of the fields. -->
	<p class="pb-2 text-sm text-muted-foreground">
		Decide per pipeline whether accepted work needs your review first. Trust is earned one pipeline
		at a time.
	</p>
	{#if policies.length === 0}
		<p class="text-sm text-muted-foreground">No policies configured yet.</p>
	{:else}
		<Field.Group>
			{#each policies as policy, index (policy.pipeline)}
				{#if index > 0}
					<Field.Separator />
				{/if}
				<TrustPolicyControl {policy} disabled={busy} onchange={(input) => void change(input)} />
			{/each}
		</Field.Group>
	{/if}
</section>
