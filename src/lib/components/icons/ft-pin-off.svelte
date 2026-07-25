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
	<path d="M12 17v5" />
	<path d="M15 9.34V7a1 1 0 011-1h2V3H6v3h2a1 1 0 011 1v2.34" />
	<path d="M6 15.24V17h8" />
	<path d="M2 2l20 20" />
	<path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9" />
	<path d="M16.12 12.47l-1.01.51A2 2 0 0014 14.76" />
</svg>
