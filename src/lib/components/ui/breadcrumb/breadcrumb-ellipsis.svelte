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
	data-slot="breadcrumb-ellipsis"
	role="presentation"
	aria-hidden="true"
	class={cn('size-5 [&>svg]:size-4 flex items-center justify-center', className)}
	{...restProps}
>
	<Icon.Ellipsis />
	<span class="sr-only">More</span>
</span>
