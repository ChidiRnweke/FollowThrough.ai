<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" />
	<path class="ft-stroke ft-d1 ft-soft" pathLength="1" d="M27 12h20a3 3 0 0 1 3 3v19" />
	<path class="ft-stroke ft-d2 ft-soft" pathLength="1" d="M20 19h21a3 3 0 0 1 3 3v22" />
	<path
		class="ft-stroke ft-d3"
		pathLength="1"
		d="M15 27h21a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V30a3 3 0 0 1 3-3z"
	/>
	<path class="ft-stroke ft-d4" pathLength="1" d="M18 36h9" />
	<circle class="ft-accent" cx="31" cy="36" r="2.4" fill="currentColor" stroke="none" />
</Frame>
