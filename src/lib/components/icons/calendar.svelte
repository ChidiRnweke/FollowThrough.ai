<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M8 3v4M16 3v4M4 10h16" /><path
		class="ft-stroke"
		pathLength="1"
		d="M20 12.5V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7.5"
	/><circle class="ft-accent" cx="17.5" cy="17.5" r="1.9" fill="currentColor" stroke="none" />
</Glyph>
