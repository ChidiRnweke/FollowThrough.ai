<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	Nothing scheduled yet: a clock face left open, its hands faint, and the dot where the first run
	would be due. Scene form of `Icon.Scheduled`.
-->
<Frame {...props}>
	<path class="ft-stroke" pathLength="1" d="M32 14a18 18 0 1 0 18 18" />
	<path class="ft-stroke ft-d1 ft-soft" pathLength="1" d="M32 22v10l6 4" />
	<circle class="ft-accent" cx="44.7" cy="19.3" r="2.6" fill="currentColor" stroke="none" />
</Frame>
