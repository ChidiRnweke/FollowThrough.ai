<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0" pathLength="1" d="M43 15.75H19.25v32.5M19.25 31.75h16.5" /><path
		class="ft-stroke ft-d2 ft-accent-stroke"
		pathLength="1"
		d="M30.75 41.75l7.25 7.25 13-18.25"
		stroke-width="2.4"
	/>
</Frame>
