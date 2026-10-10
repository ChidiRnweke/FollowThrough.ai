<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
	/><path class="ft-stroke" pathLength="1" d="M7 10.5l1.5 1.5 2.5-2.5M14 11h3M7 16h7" /><circle
		class="ft-accent"
		cx="17"
		cy="16"
		r="1.3"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
