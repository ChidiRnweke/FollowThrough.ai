<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="12" cy="8" r="3.6" /><path
		class="ft-stroke"
		pathLength="1"
		d="M4.5 20.5a7.5 7.5 0 0 1 12.6-5.5"
	/><circle class="ft-accent" cx="19.2" cy="18.4" r="1.45" fill="currentColor" stroke="none" />
</Glyph>
