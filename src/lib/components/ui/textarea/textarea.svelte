<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		// Light mode fills with `bg-background` rather than going transparent: a field has
		// to read as a control on every surface, and the panels it sits in are a step off
		// paper. Dark keeps upstream's `bg-input/30`.
		// Focus is a teal border and a teal wash, both painted inside the border box —
		// nothing outward, because an outward ring gets shaved by any clipping ancestor
		// (a ScrollArea viewport, say) and reads as a lopsided glow. `--brand` rather than
		// `--primary`: they are the same teal in light, but dark lifts brand to stay teal
		// where primary goes muddy.
		'border-input text-foreground bg-background dark:bg-input/30 focus-visible:border-brand focus-visible:bg-brand/12 dark:focus-visible:bg-brand/20 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-xl border px-3 py-3 text-base transition-colors md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	bind:value
	{...restProps}></textarea>
