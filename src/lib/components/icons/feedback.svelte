<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M8 18l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3z"
	/><path class="ft-stroke" pathLength="1" d="M12 7.5v3.2" /><circle
		class="ft-accent"
		cx="12"
		cy="13.8"
		r="1.3"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
