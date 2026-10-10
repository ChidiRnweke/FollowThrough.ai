<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M3 16.5V6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5H8"
	/><path class="ft-stroke" pathLength="1" d="M9 11v5M13 11v2.6" /><circle
		class="ft-accent"
		cx="13"
		cy="16.4"
		r="1.25"
		fill="currentColor"
		stroke="none"
	/><circle class="ft-accent" cx="4.4" cy="19.6" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
