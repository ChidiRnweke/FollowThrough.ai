<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M5 5h12M11 5l-4 14M15 15l5 5M20 15l-5 5" />
</Glyph>
