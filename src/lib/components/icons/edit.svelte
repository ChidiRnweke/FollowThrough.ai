<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M15.5 4.5l4 4L8.5 19.5l-5 1 1-5zM13.5 6.5l4 4" />
</Glyph>
