<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M4 6v12M12 6v12M4 12h8M16.5 10.5a2 2 0 0 1 3.9.6c0 2-3.9 3.5-3.9 6.9h4"
	/>
</Glyph>
