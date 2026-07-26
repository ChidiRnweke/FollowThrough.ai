<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { pipelineLabels } from './labels';

	let {
		policy,
		disabled = false,
		onchange
	}: {
		policy: TrustPolicy;
		disabled?: boolean;
		onchange?: (input: UpdateTrustPolicyInput) => void;
	} = $props();

	const value = $derived(policy.autoAcceptEnabled ? 'auto' : 'review');
	const descriptions: Record<string, string> = {
		extract_promises: 'Commitments found in your notes',
		relate: 'Backlinks between related notes',
		reference: 'External references for a selection',
		agent: 'Changes proposed in chat'
	};
</script>

<Card.Root class="gap-2 py-3">
	<Card.Header class="px-4">
		<Card.Title class="text-sm font-medium">{pipelineLabels[policy.pipeline]}</Card.Title>
		<Card.Description>{descriptions[policy.pipeline]}</Card.Description>
		<Card.Action>
			<Select.Root
				type="single"
				{value}
				{disabled}
				onValueChange={(selected) =>
					onchange?.({
						pipeline: policy.pipeline,
						autoAcceptEnabled: selected === 'auto',
						...(policy.minimumConfidence !== undefined
							? { minimumConfidence: policy.minimumConfidence }
							: {})
					})}
			>
				<Select.Trigger size="sm" aria-label="Trust policy for {pipelineLabels[policy.pipeline]}">
					{value === 'auto' ? 'Auto-accept' : 'Review first'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="review" label="Review first" />
					<Select.Item value="auto" label="Auto-accept" />
				</Select.Content>
			</Select.Root>
		</Card.Action>
	</Card.Header>
	{#if policy.autoAcceptEnabled && policy.minimumConfidence !== undefined}
		<Card.Content class="px-4">
			<p class="text-xs text-muted-foreground">
				Auto-accepts above {policy.minimumConfidence}% confidence. Auto-accepted items stay visibly
				AI-made and are one click to revert.
			</p>
		</Card.Content>
	{/if}
</Card.Root>
