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
	<rect x="3.5" y="3" width="5" height="5" rx="1" />
	<path d="M4 5.5l1.5 1.5L8 4.5" />
	<line x1="12" y1="5.5" x2="21" y2="5.5" />
	<rect x="3.5" y="9.5" width="5" height="5" rx="1" />
	<line x1="12" y1="12" x2="21" y2="12" />
	<rect x="3.5" y="16" width="5" height="5" rx="1" />
	<line x1="12" y1="18.5" x2="18" y2="18.5" />
</svg>
