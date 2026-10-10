<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.4-1.2-1.8-1.2-3 0-1 .8-1.6 1.9-1.6H17a3.5 3.5 0 0 0 3.5-3.5c0-3.9-3.8-7-8.5-7z"
	/><circle cx="8" cy="10.5" r="1.15" fill="currentColor" stroke="none" /><circle
		cx="12"
		cy="7.5"
		r="1.15"
		fill="currentColor"
		stroke="none"
	/><circle class="ft-accent" cx="16" cy="10" r="1.3" fill="currentColor" stroke="none" />
</Glyph>
