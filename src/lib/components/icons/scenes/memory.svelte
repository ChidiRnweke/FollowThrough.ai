<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M21 8h22a3 3 0 0 1 3 3v39l-14-9-14 9V11a3 3 0 0 1 3-3z"
	/><path class="ft-stroke ft-d2 ft-soft" pathLength="1" d="M26 31h12" /><circle
		class="ft-accent"
		cx="32"
		cy="21"
		r="2.8"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
