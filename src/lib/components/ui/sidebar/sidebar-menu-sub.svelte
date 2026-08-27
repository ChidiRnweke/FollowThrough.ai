<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<ul
	bind:this={ref}
	data-slot="sidebar-menu-sub"
	data-sidebar="menu-sub"
	class={cn(
		// 16px of indent per level (8px margin to the guide line + 8px padding), down
		// from 24px: at depth two or three the old recipe spent more width on nesting
		// than on the titles it was nesting.
		//
		// `gap-0` holds peer rows contiguous — a dense list is separated by row height
		// and hover wash, and holding this rung at zero is what gives the 4px and 8px
		// steps above it something to mean. `py-1` is that next rung: 4px of air above
		// and below a subtree, separating it from the siblings it sits among.
		'border-sidebar-border mx-2 translate-x-px gap-0 border-l px-2 py-1 group-data-[collapsible=icon]:hidden flex min-w-0 flex-col',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ul>
