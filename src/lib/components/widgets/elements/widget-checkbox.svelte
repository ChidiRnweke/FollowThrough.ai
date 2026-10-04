<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	let { props, bindings, emit }: BaseComponentProps<{ label: string; checked: boolean }> = $props();

	// A `$bindState` or `$bindItem` prop writes back through the store, which is how a tick
	// becomes a data edit. A literal `checked` has no binding and stays as declared.
	const checked = getBoundProp<boolean>(
		() => props.checked,
		() => bindings?.checked
	);
</script>

<Label data-slot="widget-checkbox" class="gap-2.5 py-0.5 text-sm leading-normal font-normal">
	<Checkbox
		checked={checked.current === true}
		onCheckedChange={(value) => {
			checked.current = value === true;
			emit('change');
		}}
	/>
	<span class={checked.current === true ? 'text-muted-foreground line-through' : 'text-foreground'}
		>{props.label}</span
	>
</Label>
