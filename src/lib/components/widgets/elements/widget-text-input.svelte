<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		props,
		bindings
	}: BaseComponentProps<{ label: string; value: string; placeholder?: string | null }> = $props();

	// Every keystroke writes the store; the view coalesces them into one change per pause.
	const value = getBoundProp<string>(
		() => props.value,
		() => bindings?.value
	);
	const id = $props.id();
</script>

<div data-slot="widget-text-input" class="flex flex-col gap-1.5">
	<Label for={id}>{props.label}</Label>
	<Input
		{id}
		bind:value={() => value.current ?? '', (next) => (value.current = next)}
		placeholder={props.placeholder ?? undefined}
	/>
</div>
