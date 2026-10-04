<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { Badge } from '$lib/components/ui/badge';

	let {
		props
	}: BaseComponentProps<{
		text: string;
		tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | null;
	}> = $props();

	// Colour never carries the status alone (design system): the text always says it.
	const toneClass = $derived(
		props.tone === 'success'
			? 'bg-success/10 text-success dark:bg-success/15'
			: props.tone === 'warning'
				? 'bg-warning/10 text-warning dark:bg-warning/15'
				: undefined
	);
	const variant = $derived(
		props.tone === 'brand' ? 'brand' : props.tone === 'danger' ? 'destructive' : 'secondary'
	);
</script>

<Badge data-slot="widget-badge" {variant} class={toneClass}>{props.text}</Badge>
