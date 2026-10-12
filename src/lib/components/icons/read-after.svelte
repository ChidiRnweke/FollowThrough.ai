<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	What the agent read before an item: the dot is the earlier item, and an arrow runs from it into
	the open circle, the item itself. Mirrors `LeadsTo`, so the pair reads as one direction.
-->
<Glyph {...props}>
	<circle class="ft-accent" cx="3.8" cy="12" r="1.4" fill="currentColor" stroke="none" />
	<path class="ft-stroke" pathLength="1" d="M7.5 12h7.5M12 9l3 3-3 3" />
	<circle class="ft-stroke" pathLength="1" cx="18" cy="12" r="3" />
</Glyph>
