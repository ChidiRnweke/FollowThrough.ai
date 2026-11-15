<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';
	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!-- A clock face left open where its next run is due; the dot is that run. -->
<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M12 4a8 8 0 1 0 8 8" /><path
		class="ft-stroke"
		pathLength="1"
		d="M12 8v4.2l2.6 1.6"
	/><circle class="ft-accent" cx="17.7" cy="6.3" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
