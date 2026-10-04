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
	<rect x="3" y="4" width="18" height="16" rx="2" />
	<path d="M7 10.5l1.5 1.5 2.5-2.5" />
	<path d="M14 11h3" />
	<path d="M7 16h10" />
</svg>
