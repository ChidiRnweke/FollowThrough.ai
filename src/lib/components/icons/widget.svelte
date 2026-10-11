<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M18 9.5V5.5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h5M3 7.5h15"
	/><path class="ft-stroke" pathLength="1" d="M13.5 12.5l7 2.6-3 1.3-1.3 3z" /><circle
		class="ft-accent"
		cx="10.6"
		cy="11.4"
		r="1.45"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
