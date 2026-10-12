<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	An item read on its own: its circle, and a faint second circle where a partner would overlap.
	The dot sits in the ground they would share. Scene form of `Icon.ReadTogether`.
-->
<Frame {...props}>
	<circle class="ft-stroke" pathLength="1" cx="25" cy="32" r="13" />
	<circle class="ft-stroke ft-d1 ft-soft" pathLength="1" cx="39" cy="32" r="13" />
	<circle class="ft-accent" cx="32" cy="32" r="2.6" fill="currentColor" stroke="none" />
</Frame>
