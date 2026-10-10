<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M14 3l5 5v3M14 3v5h5"
	/><path class="ft-stroke" pathLength="1" d="M10 16h11M18 13l3 3-3 3" />
</Glyph>
