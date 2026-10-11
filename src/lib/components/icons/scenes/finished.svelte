<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" />
	<path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M17 13h30a3 3 0 0 1 3 3v31a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3z"
	/>
	<path class="ft-stroke ft-d2 ft-soft" pathLength="1" d="M24 32l6 6 11-13" />
	<circle class="ft-accent" cx="24" cy="32" r="2.6" fill="currentColor" stroke="none" />
</Frame>
