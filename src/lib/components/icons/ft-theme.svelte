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
	<circle cx="12" cy="12" r="4" />
	<path d="M12 2v2" />
	<path d="M12 20v2" />
	<path d="M4.93 4.93l1.41 1.41" />
	<path d="M17.66 17.66l1.41 1.41" />
	<path d="M2 12h2" />
	<path d="M20 12h2" />
	<path d="M6.34 17.66l-1.41 1.41" />
	<path d="M17.66 6.34l1.41-1.41" />
</svg>
