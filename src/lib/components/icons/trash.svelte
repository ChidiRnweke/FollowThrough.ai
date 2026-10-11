<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M4 6.5h16M9.5 6.5v-2h5v2M6.5 6.5l1 13.5h9l1-13.5"
	/><path class="ft-stroke" pathLength="1" d="M10.5 10.5v6M13.5 10.5v3.3" /><circle
		class="ft-accent"
		cx="13.5"
		cy="16.6"
		r="1.25"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
