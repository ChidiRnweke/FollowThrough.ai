<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import * as Select from '$lib/components/ui/select';

	let {
		props,
		bindings,
		emit
	}: BaseComponentProps<{
		label?: string | null;
		value: string;
		options: readonly { value: string; label: string }[];
	}> = $props();

	const value = getBoundProp<string>(
		() => props.value,
		() => bindings?.value
	);
	const selected = $derived(props.options.find((option) => option.value === value.current));
</script>

<div data-slot="widget-select">
	<Select.Root
		type="single"
		value={value.current ?? ''}
		onValueChange={(next) => {
			value.current = next;
			emit('change');
		}}
	>
		<Select.Trigger class="w-40" aria-label={props.label ?? 'Choose'}>
			{selected?.label ?? 'Choose'}
		</Select.Trigger>
		<Select.Content>
			{#each props.options as option (option.value)}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
