<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(),
		class: className,
		children,
		...props
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="input-group"
	role="group"
	class={cn(
		// Focus tokens mirror the bare Input/Textarea so a grouped field and a plain one
		// read identically: teal border, teal wash, nothing outside the box. The resting
		// `bg-background` / dark-only `bg-input/30` split matches the bare Input too.
		'group/input-group border-input bg-background dark:bg-input/30 has-[[data-slot=input-group-control]:focus-visible]:border-brand has-[[data-slot=input-group-control]:focus-visible]:bg-brand/12 dark:has-[[data-slot=input-group-control]:focus-visible]:bg-brand/20 has-[[data-slot][aria-invalid=true]]:border-destructive h-9 rounded-4xl border transition-colors in-data-[slot=combobox-content]:focus-within:border-inherit has-data-[align=block-end]:rounded-2xl has-data-[align=block-start]:rounded-2xl has-[textarea]:rounded-xl has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5 relative flex w-full min-w-0 items-center outline-none has-[>textarea]:h-auto',
		className
	)}
	{...props}
>
	{@render children?.()}
</div>
