<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
	import { toast } from 'svelte-sonner';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import type { DateTime } from '$lib/models/workspace';
	import type { WorkspaceRecord } from '$lib/models/workspace-records';
	import TrustPolicyControl from '../trust-policy-control.svelte';
	import * as Field from '$lib/components/ui/field';

	const current = workspaceSession.current;
	if (!current) throw new Error('Open the workspace before editing settings');
	const session = current;
	const pipelines = ['extract_promises', 'relate', 'reference', 'agent', 'memory'] as const;
	const policies = $derived(
		pipelines.map((pipeline): TrustPolicy => {
			const stored = session.resources.views
				.all('trust_policies')
				.find((policy) => policy.pipeline === pipeline);
			const timestamp = new Date().toISOString() as DateTime;
			return (
				stored ?? {
					userId: session.shell.user.id,
					pipeline,
					autoAcceptEnabled: false,
					createdAt: timestamp,
					updatedAt: timestamp
				}
			);
		})
	);
	let busy = $state(false);

	async function change(input: UpdateTrustPolicyInput): Promise<void> {
		busy = true;
		try {
			const policy = policies.find((policy) => policy.pipeline === input.pipeline);
			if (!policy) throw new Error('The policy is unavailable');
			const draft = session.resources.draft({
				type: 'trust_policies',
				id: [policy.userId, policy.pipeline]
			});
			const local: WorkspaceRecord = { type: 'trust_policies', value: { ...policy, ...input } };
			draft.captureOrCreate(local);
			const result = await draft.stage({
				command: { kind: 'updateTrustPolicy', userId: policy.userId, ...input },
				local,
				coalesce: null,
				references: []
			});
			if (result.kind === 'failure') throw new Error(result.message);
			toast.success('Saved on device');
			// audit-allow: silent-catch — policy failure is reported and the persisted policy remains authoritative.
		} catch {
			toast.error('Could not update the policy. Try again.');
		} finally {
			busy = false;
		}
	}
</script>

<section class="flex max-w-3xl flex-col gap-6">
	{#if session.resources.availability !== 'complete'}
		<p role="status" class="text-sm text-muted-foreground">
			Some settings are unavailable on this device. Connect to finish downloading them before making
			changes.
		</p>
	{/if}
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
				<TrustPolicyControl
					{policy}
					disabled={busy || session.resources.availability !== 'complete'}
					onchange={(input) => void change(input)}
				/>
			{/each}
		</Field.Group>
	{/if}
</section>
