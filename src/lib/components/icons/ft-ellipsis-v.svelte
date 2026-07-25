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
	<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
	<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
	<circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
</svg>
