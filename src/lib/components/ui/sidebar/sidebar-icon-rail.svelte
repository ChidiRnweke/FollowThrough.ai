<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<!-- The inset variant's always-visible column of icon buttons beside the panel. -->
<nav
	bind:this={ref}
	data-slot="sidebar-icon-rail"
	data-sidebar="icon-rail"
	class={cn('flex w-(--sidebar-width-icon) shrink-0 flex-col items-center gap-4 py-3', className)}
	{...restProps}
>
	{@render children?.()}
</nav>
