<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="12" cy="11.5" r="3" /><path
		class="ft-stroke"
		pathLength="1"
		d="M9.9 9.4L6.6 6.1M14.1 9.4l3.3-3.3M12 14.5V18"
	/><circle cx="5.4" cy="4.9" r="1.45" fill="currentColor" stroke="none" /><circle
		cx="18.6"
		cy="4.9"
		r="1.45"
		fill="currentColor"
		stroke="none"
	/><circle class="ft-accent" cx="12" cy="20.5" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
