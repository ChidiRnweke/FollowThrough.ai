<script lang="ts">
	// Shared frame for empty-state scenes: a 64-unit grid with the same 1.75 stroke as the icons.
	// `ft-scene` draws the strokes in on mount, staggered by their `ft-d*` step (layout.css).
	import type { Snippet } from 'svelte';
	import type { SVGAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		children,
		class: className,
		...rest
	}: SVGAttributes<SVGSVGElement> & { children: Snippet } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 64 64"
	width="64"
	height="64"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	data-slot="scene"
	class={cn('ft-scene', className)}
	{...rest}
	aria-hidden="true"
>
	{@render children()}
</svg>
