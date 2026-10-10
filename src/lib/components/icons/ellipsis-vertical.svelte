<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle
		cx="12"
		cy="12"
		r="1.4"
		fill="currentColor"
		stroke="none"
	/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
</Glyph>
