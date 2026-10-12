<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	Nothing read before an item yet: the dot where an earlier item would sit, a faint arrow into the
	item, and its circle. Scene form of `Icon.ReadAfter`.
-->
<Frame {...props}>
	<circle class="ft-stroke" pathLength="1" cx="47" cy="32" r="8" />
	<path class="ft-stroke ft-d1 ft-soft" pathLength="1" d="M19 32h18M32 26.5l5.5 5.5-5.5 5.5" />
	<circle class="ft-accent" cx="11" cy="32" r="2.6" fill="currentColor" stroke="none" />
</Frame>
