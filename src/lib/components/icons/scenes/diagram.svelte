<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path
		class="ft-stroke ft-d0"
		pathLength="1"
		d="M14 12h36a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"
	/><path class="ft-stroke ft-d1 ft-soft" pathLength="1" d="M22 56h20M32 48v8" /><circle
		class="ft-stroke ft-d2"
		pathLength="1"
		cx="21"
		cy="36"
		r="3.2"
	/><path class="ft-stroke ft-d3" pathLength="1" d="M24.2 36c6.5 0 5.5-12 12-12h6" /><circle
		class="ft-accent"
		cx="46"
		cy="24"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
