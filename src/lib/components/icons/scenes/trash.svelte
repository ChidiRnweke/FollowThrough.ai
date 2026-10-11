<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M17 27l3.2 25.5a3 3 0 0 0 3 2.5h17.6a3 3 0 0 0 3-2.5L47 27"
	/><path class="ft-stroke ft-d2" pathLength="1" d="M15 21.5l32-7" /><path
		class="ft-stroke ft-d3"
		pathLength="1"
		d="M26.5 18.9l-.8-3.4a2 2 0 0 1 1.5-2.4l5.8-1.3a2 2 0 0 1 2.4 1.5l.8 3.4"
	/><path class="ft-stroke ft-d4 ft-soft" pathLength="1" d="M27 33v14M37 33v8" /><circle
		class="ft-accent"
		cx="37"
		cy="46.5"
		r="2.4"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
