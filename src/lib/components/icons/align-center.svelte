<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M4 6h16M7 12h10M5.5 18h13" />
</Glyph>
