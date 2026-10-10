<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="12" cy="12" r="9" /><path
		class="ft-stroke"
		pathLength="1"
		d="M15 9l-6 6M9 9l6 6"
	/>
</Glyph>
