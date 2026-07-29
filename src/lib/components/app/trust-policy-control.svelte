<script lang="ts">
	import type { TrustPolicy, UpdateTrustPolicyInput } from '$lib/models';
	import * as Field from '$lib/components/ui/field';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
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
		<Field.Title>{pipelineLabels[policy.pipeline]}</Field.Title>
		<Field.Description>{descriptions[policy.pipeline]}</Field.Description>
		{#if policy.autoAcceptEnabled && policy.minimumConfidence !== undefined}
			<p class="provenance-caption pt-1">
				Auto-accepts above {policy.minimumConfidence}% confidence. Auto-accepted items stay visibly
				AI-made and are one click to revert.
			</p>
		{/if}
	</Field.Content>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		{value}
		{disabled}
		onValueChange={changed}
		aria-label="Trust policy for {pipelineLabels[policy.pipeline]}"
	>
		<ToggleGroup.Item value="review">Review first</ToggleGroup.Item>
		<ToggleGroup.Item value="auto">Auto-accept</ToggleGroup.Item>
	</ToggleGroup.Root>
</Field.Field>
