<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();

	// Light mode fills with `bg-background` rather than going transparent: a field has to
	// read as a control on every surface, and the panels it sits in are a step off paper.
	// Dark keeps upstream's `bg-input/30`. Focus is a teal border and a teal wash, both
	// inside the border box — an outward ring paints past it, so any clipping ancestor
	// shaves it on one axis and leaves a lopsided glow. `--brand` rather than `--primary`:
	// same teal in light, but dark lifts brand to stay teal where primary goes muddy.
	// `text-foreground` pins the caret, which is `currentColor` by default and otherwise
	// follows any ancestor `text-*` class.
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'bg-background dark:bg-input/30 border-input text-foreground focus-visible:border-brand focus-visible:bg-brand/12 dark:focus-visible:bg-brand/20 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 rounded-4xl border px-3 py-1 text-base transition-colors file:h-7 file:text-sm file:font-medium md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'bg-background dark:bg-input/30 border-input text-foreground focus-visible:border-brand focus-visible:bg-brand/12 dark:focus-visible:bg-brand/20 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 rounded-4xl border px-3 py-1 text-base transition-colors file:h-7 file:text-sm file:font-medium md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
