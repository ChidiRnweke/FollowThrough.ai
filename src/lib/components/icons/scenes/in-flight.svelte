<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path class="ft-stroke ft-d0 ft-soft" pathLength="1" d="M14 57h36" />
	<path class="ft-stroke ft-d1" pathLength="1" d="M10 50c10 0 16-4 22-12s12-18 19-21" />
	<path class="ft-stroke ft-d2 ft-soft" pathLength="1" d="M36 44h9M41 50h7" />
	<circle class="ft-accent" cx="54.5" cy="15.5" r="2.6" fill="currentColor" stroke="none" />
</Frame>
