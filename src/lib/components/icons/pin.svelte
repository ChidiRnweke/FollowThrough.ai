<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M9 3.5h6M10 3.5v5.5l-3 3.5h10l-3-3.5V3.5M12 12.5v5"
	/><circle class="ft-accent" cx="12" cy="20.3" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
