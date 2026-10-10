<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M8.5 12.5l6.3-6.3a2.8 2.8 0 0 1 4 4l-7.9 7.9a4.6 4.6 0 0 1-6.5-6.5l7.2-7.2"
	/><circle class="ft-accent" cx="13.4" cy="2.9" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
