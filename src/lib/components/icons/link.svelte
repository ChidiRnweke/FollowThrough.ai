<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!--
	Two chain links woven through each other, at the angle of the chain emoji: each passes over the
	other once, so they read as joined rather than overlapping. The upper link's far end is open and
	ends in the dot. The links are separate groups so the snap moment (`.ft-snap`) can draw them
	together.
-->
<Glyph {...props}>
	<g class="ft-link-a">
		<path class="ft-stroke" pathLength="1" d="M4.18 13.87 L7.85 10.79 A3.6 3.6 0 0 1 13.7 12.91" />
		<path
			class="ft-stroke"
			pathLength="1"
			d="M13.28 15.34 A3.6 3.6 0 0 1 12.48 16.3 L8.8 19.38 A3.6 3.6 0 0 1 4.18 13.87"
		/>
	</g>
	<g class="ft-link-b">
		<path
			class="ft-stroke"
			pathLength="1"
			d="M10.3 11.09 A3.6 3.6 0 0 0 16.15 13.21 L19.82 10.13 A3.6 3.6 0 0 0 20.99 8.3"
		/>
		<path
			class="ft-stroke"
			pathLength="1"
			d="M17.21 3.78 A3.6 3.6 0 0 0 15.2 4.62 L11.52 7.7 A3.6 3.6 0 0 0 10.67 8.76"
		/>
		<circle class="ft-accent" cx="20.27" cy="5.05" r="1.3" fill="currentColor" stroke="none" />
	</g>
</Glyph>
