<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" /><circle
		class="ft-accent"
		cx="12"
		cy="3.5"
		r="1.7"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
