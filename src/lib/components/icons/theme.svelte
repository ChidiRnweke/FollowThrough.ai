<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<!-- Draws the mode you are in: a sun in light, a moon in dark. Both are drawn and layout.css
     shows the one that matches `.dark`, so the glyph is right before hydration. -->
<Glyph {...props}>
	<g class="ft-theme-light">
		<circle class="ft-stroke" pathLength="1" cx="12" cy="12" r="4" /><path
			class="ft-stroke"
			pathLength="1"
			d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M5.6 18.4L7 17M18.4 18.4L17 17"
		/><circle class="ft-accent" cx="18" cy="6" r="1.45" fill="currentColor" stroke="none" />
	</g>
	<g class="ft-theme-dark">
		<path
			class="ft-stroke"
			pathLength="1"
			d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"
		/><circle class="ft-accent" cx="17.6" cy="5.6" r="1.6" fill="currentColor" stroke="none" />
	</g>
</Glyph>
