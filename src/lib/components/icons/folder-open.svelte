<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M3 17.5V6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v1.5"
	/><path
		class="ft-stroke"
		pathLength="1"
		d="M3 17.5l2.4-5.9a1.5 1.5 0 0 1 1.4-.9h12.8a1 1 0 0 1 .9 1.4l-2.4 6.3a1.5 1.5 0 0 1-1.4 1H9"
	/><circle class="ft-accent" cx="5.6" cy="19.4" r="1.3" fill="currentColor" stroke="none" />
</Glyph>
