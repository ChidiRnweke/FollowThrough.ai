<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M3 17h4a5 5 0 0 1 10 0h1.3" /><path
		class="ft-stroke"
		pathLength="1"
		d="M12 5.5v2M6.3 8.3l1.4 1.4M17.7 8.3l-1.4 1.4"
	/><circle class="ft-accent" cx="20.6" cy="17" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
