<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';

	let { props }: BaseComponentProps<{ text: string; level?: 2 | 3 | 4 | null }> = $props();
</script>

<svelte:element
	this={`h${props.level ?? 3}`}
	data-slot="widget-heading"
	class="text-sm font-semibold text-foreground">{props.text}</svelte:element
>
