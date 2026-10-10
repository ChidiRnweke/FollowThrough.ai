<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M12 3.5V15M7 10.5l5 4.5 5-4.5M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
	/>
</Glyph>
