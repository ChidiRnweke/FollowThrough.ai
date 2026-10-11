<script lang="ts">
	// Shared frame for every glyph: a 24-unit grid, a 1.75 stroke, round ends, ink from
	// `currentColor`. Strokes carry `ft-stroke` with `pathLength="1"` and the terminal dot
	// carries `ft-accent`; layout.css animates both when a live ancestor appears.
	import type { Snippet } from 'svelte';
	import type { SVGAttributes } from 'svelte/elements';

	let { children, ...rest }: SVGAttributes<SVGSVGElement> & { children: Snippet } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width="24"
	height="24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	data-slot="icon"
	{...rest}
	aria-hidden="true"
>
	{@render children()}
</svg>
