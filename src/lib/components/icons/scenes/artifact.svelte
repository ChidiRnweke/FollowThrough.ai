<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M32 9l18 10v22L32 51 14 41V19z"
	/><path class="ft-stroke ft-d2" pathLength="1" d="M14 19l18 10 18-10M32 29v14" /><circle
		class="ft-accent"
		cx="32"
		cy="19"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
