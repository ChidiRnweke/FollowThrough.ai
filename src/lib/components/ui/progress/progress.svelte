<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		max = 100,
		value,
		indicatorClass,
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> & {
		/** The filled part's own classes, for a meter whose fill is not the primary colour. */
		indicatorClass?: string;
	} = $props();
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="progress"
	class={cn(
		'bg-muted h-3 rounded-4xl relative flex w-full items-center overflow-x-hidden',
		className
	)}
	{value}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class={cn('bg-primary size-full flex-1 transition-all', indicatorClass)}
		style="transform: translateX(-{100 - (100 * (value ?? 0)) / (max ?? 1)}%)"
	></div>
</ProgressPrimitive.Root>
