<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<rect class="ft-stroke" pathLength="1" x="8" y="8" width="13" height="13" rx="2" /><path
		class="ft-stroke"
		pathLength="1"
		d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
	/>
</Glyph>
