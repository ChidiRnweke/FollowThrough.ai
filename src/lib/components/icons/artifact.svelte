<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path class="ft-stroke" pathLength="1" d="M20 7.5v9L12 21l-8-4.5v-9L12 3z" /><path
		class="ft-stroke"
		pathLength="1"
		d="M4 7.5l8 4.5 8-4.5M12 12v5.5"
	/><circle class="ft-accent" cx="12" cy="7.4" r="1.3" fill="currentColor" stroke="none" />
</Glyph>
