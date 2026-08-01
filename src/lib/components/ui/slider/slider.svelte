<script lang="ts">
	import { Slider as SliderPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	// Single-value only: the multi-thumb union in `SliderPrimitive.RootProps`
	// does not survive prop spreading, and nothing here needs a range.
	let {
		ref = $bindable(null),
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		onValueChange,
		class: className,
		...restProps
	}: {
		ref?: HTMLElement | null;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		onValueChange?: (value: number) => void;
		class?: string;
		'aria-label'?: string;
	} = $props();
</script>

<SliderPrimitive.Root
	type="single"
	bind:ref
	bind:value
	{min}
	{max}
	{step}
	{disabled}
	{onValueChange}
	data-slot="slider"
	class={cn(
		'relative flex w-full touch-none items-center select-none data-disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="slider-track"
			class="rounded-4xl bg-muted data-horizontal:h-3 data-horizontal:w-full relative grow overflow-hidden"
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class="bg-primary absolute select-none data-horizontal:h-full"
			/>
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				data-slot="slider-thumb"
				index={thumb.index}
				class="size-4 rounded-4xl border border-primary bg-white shadow-sm ring-ring/50 transition-colors hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
