<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import * as Card from '$lib/components/ui/card';

	let {
		props,
		children
	}: BaseComponentProps<{ title?: string | null; description?: string | null }> = $props();
</script>

<Card.Root size="sm" data-slot="widget-card">
	{#if props.title || props.description}
		<Card.Header>
			{#if props.title}<Card.Title>{props.title}</Card.Title>{/if}
			{#if props.description}<Card.Description>{props.description}</Card.Description>{/if}
		</Card.Header>
	{/if}
	<Card.Content>{@render children?.()}</Card.Content>
</Card.Root>
