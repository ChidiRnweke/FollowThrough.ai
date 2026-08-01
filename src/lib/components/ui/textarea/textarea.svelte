<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
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
		// The resting `bg-input/30` is scoped to dark, as upstream shadcn has it.
		// Unconditionally it laid a faint olive wash over the light palette's near-paper
		// background, which gave an empty field almost no edge and made a resting 1px
		// caret easy to lose. Focus is the exception — it gets a full teal wash in both
		// themes, matching the ::selection accent.
		'border-input text-foreground dark:bg-input/30 focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:bg-primary/12 dark:focus-visible:bg-brand/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-xl border px-3 py-3 text-base transition-colors focus-visible:ring-[3px] aria-invalid:ring-[3px] md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	bind:value
	{...restProps}></textarea>
