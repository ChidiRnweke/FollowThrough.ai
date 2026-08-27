<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>, HTMLUListElement> = $props();
</script>

<!-- `gap-0.5` — 2px, the ladder's rung for a handful of distinct nav destinations.
     The project tree overrides it to 8px between projects and holds its own leaf
     lists at 0; see the ladder table in `project-tree-view.svelte`. -->
<ul
	bind:this={ref}
	data-slot="sidebar-menu"
	data-sidebar="menu"
	class={cn('gap-0.5 flex w-full min-w-0 flex-col', className)}
	{...restProps}
>
	{@render children?.()}
</ul>
