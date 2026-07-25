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
	<line x1="3" y1="6" x2="12" y2="6" />
	<line x1="16" y1="6" x2="21" y2="6" />
	<circle cx="14" cy="6" r="2" />
	<line x1="3" y1="12" x2="6" y2="12" />
	<line x1="10" y1="12" x2="21" y2="12" />
	<circle cx="8" cy="12" r="2" />
	<line x1="3" y1="18" x2="14" y2="18" />
	<line x1="18" y1="18" x2="21" y2="18" />
	<circle cx="16" cy="18" r="2" />
</svg>
