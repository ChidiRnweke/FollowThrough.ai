<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7" /><path
		class="ft-stroke"
		pathLength="1"
		d="M4 4.5v4.2h4.2M12 7.5v2.8"
	/><circle class="ft-accent" cx="12" cy="12.2" r="1.4" fill="currentColor" stroke="none" />
</Glyph>
