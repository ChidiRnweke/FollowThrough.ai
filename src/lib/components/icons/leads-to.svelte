<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	What an item makes the agent read next: the item is the open circle, an arrow leaves it, and
	the dot is the item read after it. Mirrors `ReadAfter`, so the pair reads as one direction.
-->
<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="6" cy="12" r="3" />
	<path class="ft-stroke" pathLength="1" d="M9 12h7.5M13.5 9l3 3-3 3" />
	<circle class="ft-accent" cx="20.2" cy="12" r="1.4" fill="currentColor" stroke="none" />
</Glyph>
