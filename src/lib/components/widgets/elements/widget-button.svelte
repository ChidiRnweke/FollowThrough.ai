<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		props,
		emit
	}: BaseComponentProps<{
		label: string;
		variant?: 'default' | 'outline' | 'ghost' | 'destructive' | null;
		disabled?: boolean | null;
	}> = $props();
</script>

<!-- The press runs the element's `on.press` binding: only the built-in state actions are allowed. -->
<Button
	data-slot="widget-button"
	variant={props.variant ?? 'default'}
	size="sm"
	class="self-end"
	disabled={props.disabled === true}
	onclick={() => emit('press')}>{props.label}</Button
>
