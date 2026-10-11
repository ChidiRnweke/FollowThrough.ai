<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<rect class="ft-stroke" pathLength="1" x="2.5" y="7" width="19" height="10" rx="5" /><circle
		class="ft-accent ft-knob"
		cx="7.5"
		cy="12"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Glyph>
