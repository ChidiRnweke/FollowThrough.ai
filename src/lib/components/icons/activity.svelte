<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<rect class="ft-stroke" pathLength="1" x="3" y="4.5" width="18" height="15" rx="2" /><path
		class="ft-stroke"
		pathLength="1"
		d="M6 12.5h2.2L10 9l2.8 6.5 2-4.5h1.4"
	/><circle class="ft-accent" cx="18" cy="11" r="1.3" fill="currentColor" stroke="none" />
</Glyph>
