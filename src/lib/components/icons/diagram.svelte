<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<rect class="ft-stroke" pathLength="1" x="3" y="3.5" width="7" height="5.5" rx="1.5" /><rect
		class="ft-stroke"
		pathLength="1"
		x="14"
		y="15"
		width="7"
		height="5.5"
		rx="1.5"
	/><path class="ft-stroke" pathLength="1" d="M6.5 9v4.3a2 2 0 0 0 2 2H14M10 6.25h5.6" /><circle
		class="ft-accent"
		cx="18.4"
		cy="6.25"
		r="1.6"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
