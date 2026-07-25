<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	let { class: className = '', ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width="24"
	height="24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	{...rest}
	aria-hidden="true"
>
	<path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
	<path d="M21 3v5h-5" />
	<path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
	<path d="M3 21v-5h5" />
</svg>
