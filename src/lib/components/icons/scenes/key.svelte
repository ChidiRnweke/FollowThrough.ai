<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<circle class="ft-stroke ft-d0" pathLength="1" cx="20" cy="32" r="10" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M30 32h24"
	/><path class="ft-stroke ft-d2" pathLength="1" d="M46 32v7M52 32v5" /><circle
		class="ft-accent"
		cx="20"
		cy="32"
		r="3"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
