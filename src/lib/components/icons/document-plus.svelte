<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5v5h5"
	/><path class="ft-stroke" pathLength="1" d="M12 11.5v6M9 14.5h4.2" /><circle
		class="ft-accent"
		cx="15.4"
		cy="14.5"
		r="1.3"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
