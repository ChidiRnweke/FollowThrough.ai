<script lang="ts">
	// The Widget glyph drawn as a scene: a window with its title bar, open at the corner where a
	// pointer reaches in, and a slider whose knob is the teal dot. A checkmark in a box read as the
	// old product mark, so the scene shows what a widget is instead: a tool you operate.
	import type { SVGAttributes } from 'svelte/elements';
	import Frame from './frame.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Frame {...props}>
	<path
		class="ft-stroke ft-d0"
		pathLength="1"
		d="M50 28V16a4 4 0 0 0-4-4H12a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h16"
	/><path class="ft-stroke ft-d1" pathLength="1" d="M8 21h42" /><path
		class="ft-stroke ft-d2 ft-soft"
		pathLength="1"
		d="M15 32h20"
	/><path class="ft-stroke ft-d3" pathLength="1" d="M35 37l18.2 6.8-7.8 3.4-3.4 7.8z" /><circle
		class="ft-accent"
		cx="27"
		cy="32"
		r="2.6"
		fill="currentColor"
		stroke="none"
	/>
</Frame>
