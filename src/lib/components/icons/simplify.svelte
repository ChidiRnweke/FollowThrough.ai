<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M5 20L15 10M19.5 4.5c-6.5 0-12 4-12 11.5h4c6.5 0 8-5.5 8-11.5z"
	/>
</Glyph>
