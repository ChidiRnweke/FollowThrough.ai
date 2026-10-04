<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { cn } from '$lib/utils.js';

	let {
		props,
		children
	}: BaseComponentProps<{ columns: 1 | 2 | 3 | 4; gap?: 'sm' | 'md' | 'lg' | null }> = $props();

	// Columns follow the widget's own width, not the window's: the same widget sits in a narrow
	// note column and in a full-width tab. Each count steps up as the container makes room.
	const COLUMNS = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 @md:grid-cols-2',
		3: 'grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3',
		4: 'grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4'
	} as const;
</script>

<div
	data-slot="widget-grid"
	class={cn(
		'grid',
		COLUMNS[props.columns],
		props.gap === 'lg' ? 'gap-4' : props.gap === 'sm' ? 'gap-1.5' : 'gap-3'
	)}
>
	{@render children?.()}
</div>
