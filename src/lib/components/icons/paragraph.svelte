<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
</Glyph>
