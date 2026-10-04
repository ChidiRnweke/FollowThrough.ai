<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { cn } from '$lib/utils.js';

	let {
		props,
		children
	}: BaseComponentProps<{
		direction?: 'vertical' | 'horizontal' | null;
		gap?: 'sm' | 'md' | 'lg' | null;
	}> = $props();
</script>

<div
	data-slot="widget-stack"
	class={cn(
		'flex',
		props.direction === 'horizontal' ? 'flex-row flex-wrap items-center' : 'flex-col',
		props.gap === 'lg' ? 'gap-4' : props.gap === 'sm' ? 'gap-1.5' : 'gap-3'
	)}
>
	{@render children?.()}
</div>
