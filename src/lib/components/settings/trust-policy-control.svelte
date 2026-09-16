<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models/agent';
	import * as Field from '$lib/components/ui/field';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { pipelineLabels } from '../shared/labels';

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
	const labels = {
		...pipelineLabels,
		extract_promises: 'Extracted tasks',
		memory: 'Memory changes'
	};
	const descriptions: Record<string, string> = {
		extract_promises: 'Commitments found in your notes',
		relate: 'Backlinks between related notes',
		reference: 'External references for a selection',
		agent: 'Changes proposed in chat',
		memory: 'Proposed additions, changes, and removals of memory'
	};

	function changed(next: string | string[]): void {
		if (next !== 'review' && next !== 'auto') return;
		onchange?.({
			pipeline: policy.pipeline,
			autoAcceptEnabled: next === 'auto',
			...(policy.minimumConfidence !== undefined
				? { minimumConfidence: policy.minimumConfidence }
				: {})
		});
	}
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Title>{labels[policy.pipeline]}</Field.Title>
		<Field.Description>{descriptions[policy.pipeline]}</Field.Description>
		{#if policy.autoAcceptEnabled && policy.minimumConfidence !== undefined}
			<p class="provenance-caption pt-1">
				Auto-accepts at or above {policy.minimumConfidence}% confidence. Auto-accepted proposals
				remain visible and can be reverted.
			</p>
		{/if}
	</Field.Content>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		{value}
		{disabled}
		onValueChange={changed}
		aria-label="Trust policy for {labels[policy.pipeline]}"
	>
		<ToggleGroup.Item value="review">Review first</ToggleGroup.Item>
		<ToggleGroup.Item value="auto">Auto-accept</ToggleGroup.Item>
	</ToggleGroup.Root>
</Field.Field>
