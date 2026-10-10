<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M12 3.5l4.5 7.5h-9z" /><rect
		class="ft-stroke"
		pathLength="1"
		x="3.5"
		y="13.5"
		width="7"
		height="7"
		rx="1.5"
	/><circle class="ft-stroke" pathLength="1" cx="17" cy="17" r="3.5" />
</Glyph>
