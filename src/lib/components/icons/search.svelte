<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M20.5 20.5l-5.4-5.4A6.5 6.5 0 1 1 15.1 5.9" /><circle
		class="ft-accent"
		cx="17"
		cy="10.5"
		r="1.45"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
