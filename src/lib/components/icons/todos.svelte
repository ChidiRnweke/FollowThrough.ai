<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M3.5 6.5l2 2L9 4.5" /><path
		class="ft-stroke"
		pathLength="1"
		d="M12 6.5h8.5M12 12h8.5M12 17.5h5"
	/><circle class="ft-stroke" pathLength="1" cx="5.75" cy="12" r="1.9" /><circle
		class="ft-stroke"
		pathLength="1"
		cx="5.75"
		cy="17.5"
		r="1.9"
	/><circle class="ft-accent" cx="20.3" cy="17.5" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
