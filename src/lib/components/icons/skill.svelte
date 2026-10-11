<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="5" cy="6" r="2.2" /><path
		class="ft-stroke"
		pathLength="1"
		d="M7.2 6H11a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h.6"
	/><circle class="ft-accent" cx="19.6" cy="18" r="1.9" fill="currentColor" stroke="none" />
</Glyph>
