<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
</Glyph>
