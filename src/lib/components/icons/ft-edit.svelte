<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	let { class: className = '', ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className} {...rest}
	aria-hidden="true"
>
	<path d="M21.17 6.81a1 1 0 00-3.99-3.99L3.84 16.17a2 2 0 00-.5.83l-1.32 4.35a.5.5 0 00.62.62l4.35-1.32a2 2 0 00.83-.5z" />
	<path d="M15 5l4 4" />
</svg>
