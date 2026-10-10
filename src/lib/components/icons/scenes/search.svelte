<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M50 50L39 39A15 15 0 1 1 38.6 16.6"
	/><path class="ft-stroke ft-d3 ft-soft" pathLength="1" d="M44 13c2.6-1.6 5.4-1.6 7.6.4" /><circle
		class="ft-accent"
		cx="55.5"
		cy="17"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
