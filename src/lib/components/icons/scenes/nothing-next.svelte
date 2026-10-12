<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	Nothing read after an item yet: its circle, a faint arrow leaving it, and the dot where the next
	item would land. Scene form of `Icon.LeadsTo`.
-->
<Frame {...props}>
	<circle class="ft-stroke" pathLength="1" cx="17" cy="32" r="8" />
	<path class="ft-stroke ft-d1 ft-soft" pathLength="1" d="M27 32h18M40 26.5l5.5 5.5-5.5 5.5" />
	<circle class="ft-accent" cx="53" cy="32" r="2.6" fill="currentColor" stroke="none" />
</Frame>
