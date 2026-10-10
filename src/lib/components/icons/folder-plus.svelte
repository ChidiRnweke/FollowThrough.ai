<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M3 16.5V6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 18.5v-2"
	/><path class="ft-stroke" pathLength="1" d="M12 11v5M9.5 13.5h3.6" /><circle
		class="ft-accent"
		cx="15.6"
		cy="13.5"
		r="1.3"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
