<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';

	let {
		props
	}: BaseComponentProps<{
		label: string;
		value: string | number;
		detail?: string | null;
		tone?: 'default' | 'muted' | null;
	}> = $props();
</script>

<div data-slot="widget-metric" class="flex flex-col gap-0.5">
	<span class="text-label text-muted-foreground">{props.label}</span>
	<span
		class={props.tone === 'muted'
			? 'text-xl font-semibold text-muted-foreground tabular-nums'
			: 'text-xl font-semibold text-foreground tabular-nums'}>{props.value}</span
	>
	{#if props.detail}<span class="text-label text-muted-foreground">{props.detail}</span>{/if}
</div>
