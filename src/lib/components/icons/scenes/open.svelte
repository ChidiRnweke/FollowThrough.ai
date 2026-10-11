<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M15 37l5-13h24l5 13" />
	<path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M10 38h12l3 6h14l3-6h12v12a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z"
	/>
	<path class="ft-stroke ft-d2 ft-soft" pathLength="1" d="M32 8v15" />
	<circle class="ft-accent" cx="32" cy="34" r="2.6" fill="currentColor" stroke="none" />
</Frame>
