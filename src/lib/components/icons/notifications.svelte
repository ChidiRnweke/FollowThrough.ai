<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M4.5 17.5h15L18 15.5V11a6 6 0 0 0-12 0v4.5z" /><circle
		class="ft-accent"
		cx="12"
		cy="20.8"
		r="1.45"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
