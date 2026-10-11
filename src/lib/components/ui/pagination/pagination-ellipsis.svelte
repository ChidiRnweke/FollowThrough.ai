<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import * as Icon from '$lib/components/icons';

	let {
		ref = $bindable(),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLSpanElement>>> = $props();
</script>

<span
	bind:this={ref}
	aria-hidden="true"
	data-slot="pagination-ellipsis"
	class={cn(
		"size-9 items-center justify-center [&_svg:not([class*='size-'])]:size-4 flex items-center justify-center",
		className
	)}
	{...restProps}
>
	<Icon.Ellipsis />
	<span class="sr-only">More pages</span>
</span>
