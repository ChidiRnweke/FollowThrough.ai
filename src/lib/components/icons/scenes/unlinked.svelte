<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	No link recorded: two chain links at the chain's angle that do not meet, the second faint. The
	dot marks where they would join. Scene form of `Icon.Link`.
-->
<Frame {...props}>
	<rect
		class="ft-stroke"
		pathLength="1"
		x="6"
		y="27"
		width="24"
		height="12"
		rx="6"
		transform="rotate(-35 18 33)"
	/>
	<rect
		class="ft-stroke ft-d1 ft-soft"
		pathLength="1"
		x="34"
		y="25"
		width="24"
		height="12"
		rx="6"
		transform="rotate(-35 46 31)"
	/>
	<circle class="ft-accent" cx="32" cy="32" r="2.6" fill="currentColor" stroke="none" />
</Frame>
