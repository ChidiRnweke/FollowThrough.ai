<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M12 19.5V6.6a3 3 0 0 0-5.6-1.5 3.2 3.2 0 0 0-1.9 4.5 3.4 3.4 0 0 0 .4 5.6A3.4 3.4 0 0 0 9 19.5h3"
	/><path
		class="ft-stroke"
		pathLength="1"
		d="M12 6.6a3 3 0 0 1 5.6-1.5 3.2 3.2 0 0 1 1.9 4.5 3.4 3.4 0 0 1-.4 5.6"
	/><circle class="ft-accent" cx="16.4" cy="18.6" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
