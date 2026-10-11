<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import Glyph from './glyph.svelte';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<Glyph {...props}>
	<path
		class="ft-stroke"
		pathLength="1"
		d="M18.15 9.59L21.08 10.49L21.08 13.51L18.15 14.41L18.05 14.64L19.49 17.35L17.35 19.49L14.64 18.05L14.41 18.15L13.51 21.08L10.49 21.08L9.59 18.15L9.36 18.05L6.65 19.49L4.51 17.35L5.95 14.64L5.85 14.41L2.92 13.51L2.92 10.49L5.85 9.59L5.95 9.36L4.51 6.65L6.65 4.51L9.36 5.95L9.59 5.85L10.49 2.92L13.51 2.92L14.41 5.85L14.64 5.95L17.35 4.51L19.49 6.65L18.05 9.36Z"
	/><circle class="ft-accent" cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" />
</Glyph>
