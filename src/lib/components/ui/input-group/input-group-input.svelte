<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...props
	}: ComponentProps<typeof Input> = $props();
</script>

<!--
	The focus state belongs to the group, which owns the pill's radius and border: the control
	drops its own border, ring and — `focus-visible:bg-*`, which twMerge keeps alongside
	`bg-transparent` because they are different variant groups — its own wash, which would
	otherwise paint a square patch inside the rounded field.

	`data-slot` comes last on purpose. The group paints itself through
	`has-[[data-slot=input-group-control]:focus-visible]`, so every one of those rules is dead if
	a caller's spread overwrites the attribute; that is not a decision a caller gets to make.
-->
<Input
	bind:ref
	class={cn(
		'rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 focus-visible:bg-transparent dark:focus-visible:bg-transparent aria-invalid:ring-0 dark:bg-transparent flex-1',
		className
	)}
	bind:value
	{...props}
	data-slot="input-group-control"
/>
