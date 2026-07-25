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
	<circle cx="12" cy="4.5" r="2.5" />
	<path d="M10.2 6.3l-3.9 3.9" />
	<circle cx="4.5" cy="12" r="2.5" />
	<path d="M7 12h10" />
	<circle cx="19.5" cy="12" r="2.5" />
	<path d="M13.8 17.7l3.9-3.9" />
	<circle cx="12" cy="19.5" r="2.5" />
</svg>
