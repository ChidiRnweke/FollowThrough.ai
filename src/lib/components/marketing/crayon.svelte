<script lang="ts">
	import type { Snippet } from 'svelte';

	// One word in a headline, underlined as if by marker: two wobbly strokes in
	// the brand teal — a solid pass and a fainter second pass, slightly offset —
	// so the line reads drawn by hand, not ruled. The brand token keeps it teal
	// in both themes.
	let { children }: { children: Snippet } = $props();
</script>

<span class="relative inline-block">
	{@render children()}
	<svg
		class="absolute bottom-0 left-0 h-1 w-full translate-y-1 overflow-visible"
		viewBox="0 0 100 10"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path
			d="M2 6 C 18 3, 38 8, 55 5 S 85 3, 98 6"
			fill="none"
			class="stroke-brand"
			stroke-width="3"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
		<path
			d="M5 8.5 C 26 5.5, 52 9.5, 75 6.5 S 92 5, 97 7.5"
			fill="none"
			class="stroke-brand"
			stroke-width="1.8"
			stroke-linecap="round"
			opacity="0.4"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
</span>
