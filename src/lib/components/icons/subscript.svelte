<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M4 5l8 10M12 5L4 15M16 15.5a2 2 0 0 1 4 .3c0 1.6-4 2.6-4 4.7h4"
	/>
</Glyph>
