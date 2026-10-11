<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" /><path
		class="ft-stroke ft-d1"
		pathLength="1"
		d="M22 31l16-16a7.5 7.5 0 0 1 10.6 10.6L28.4 45.8a11.5 11.5 0 0 1-16.3-16.3L30 11.6"
	/><circle class="ft-accent" cx="34.5" cy="7.6" r="2.6" fill="currentColor" stroke="none" />
</Frame>
