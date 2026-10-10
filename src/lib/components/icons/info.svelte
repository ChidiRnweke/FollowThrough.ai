<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="12" cy="12" r="9" /><path
		class="ft-stroke"
		pathLength="1"
		d="M12 11v5.5"
	/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
</Glyph>
