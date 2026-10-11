<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M10 50V16a3 3 0 0 1 3-3h10l4 5h18a3 3 0 0 1 3 3v6"
	/><path
		class="ft-stroke ft-d2"
		pathLength="1"
		d="M10 50l6.2-18.6a2 2 0 0 1 1.9-1.4H54a2 2 0 0 1 1.9 2.6L50 50z"
	/><circle class="ft-accent" cx="33" cy="40.5" r="2.6" fill="currentColor" stroke="none" />
</Frame>
