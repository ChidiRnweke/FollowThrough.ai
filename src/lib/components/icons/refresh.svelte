<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M20 11a8 8 0 0 0-14.3-4.3L3.5 9M3.5 4v5h5M4 13a8 8 0 0 0 14.3 4.3l2.2-2.3M20.5 20v-5h-5"
	/>
</Glyph>
