<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path
		class="ft-stroke ft-d0"
		pathLength="1"
		d="M14 12h36a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"
	/><path class="ft-stroke ft-d1" pathLength="1" d="M18 26l3 3 6-6" /><path
		class="ft-stroke ft-d2"
		pathLength="1"
		d="M32 26h14"
	/><path class="ft-stroke ft-d3 ft-soft" pathLength="1" d="M18 38h20" /><circle
		class="ft-accent"
		cx="44"
		cy="38"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
