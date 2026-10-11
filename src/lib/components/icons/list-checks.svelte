<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M3.5 6.5l1.75 1.75L8.5 5M3.5 16.5l1.75 1.75L8.5 15M12 7h8M12 17h8"
	/>
</Glyph>
