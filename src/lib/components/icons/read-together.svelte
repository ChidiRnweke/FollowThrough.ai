<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	Two items read in the same chats: two circles that overlap, with the dot where they share
	ground. The overlap is the shared chats, which is what the connection map counts.
-->
<Glyph {...props}>
	<circle class="ft-stroke" pathLength="1" cx="9" cy="12" r="5.5" />
	<circle class="ft-stroke" pathLength="1" cx="15" cy="12" r="5.5" />
	<circle class="ft-accent" cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
</Glyph>
