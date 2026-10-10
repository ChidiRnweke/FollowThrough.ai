<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M32 50V18a7 7 0 0 0-13-3.5 7.5 7.5 0 0 0-4.5 10.5 8 8 0 0 0 1 13A8 8 0 0 0 25 50h7"
	/><path
		class="ft-stroke ft-d2"
		pathLength="1"
		d="M32 18a7 7 0 0 1 13-3.5 7.5 7.5 0 0 1 4.5 10.5 8 8 0 0 1-1 13"
	/><path class="ft-stroke ft-d3 ft-soft" pathLength="1" d="M24 30h4M40 30h-4" /><circle
		class="ft-accent"
		cx="45"
		cy="47"
		r="2.8"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
