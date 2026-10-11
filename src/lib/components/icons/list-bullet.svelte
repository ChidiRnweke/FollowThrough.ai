<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M9 6h11M9 12h11M9 18h11" /><circle
		cx="4.5"
		cy="6"
		r="1.2"
		fill="currentColor"
		stroke="none"
	/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle
		cx="4.5"
		cy="18"
		r="1.2"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
