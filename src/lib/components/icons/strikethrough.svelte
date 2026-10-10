<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M16.5 7.5C16 5.5 14 4.5 12 4.5c-2.5 0-4.5 1.4-4.5 3.5 0 1.6 1.2 2.6 3 3.2M4 12h16M15.5 14.5c.6.6 1 1.4 1 2.3 0 2-2 3.2-4.5 3.2-2.3 0-4.3-1-5-3"
	/>
</Glyph>
