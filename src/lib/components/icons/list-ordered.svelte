<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M10 6h10M10 12h10M10 18h10M4 4.5l1.5-1V8M4 8h3M4 14a1.5 1.5 0 0 1 2.8.7c0 1-2.8 1.8-2.8 3.3h3"
	/>
</Glyph>
