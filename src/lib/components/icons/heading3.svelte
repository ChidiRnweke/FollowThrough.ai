<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M4 6v12M12 6v12M4 12h8M16.5 9.5a2 2 0 1 1 2 3 2.3 2.3 0 1 1-2 3.6"
	/>
</Glyph>
