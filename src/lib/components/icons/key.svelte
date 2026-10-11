<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="7.5" cy="16.5" r="4" /><path
		class="ft-stroke"
		pathLength="1"
		d="M10.4 13.6L20 4M16.5 7.5l2.5 2.5M14 10l2 2"
	/><circle class="ft-accent" cx="7.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
</Glyph>
