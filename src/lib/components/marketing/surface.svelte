<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	// A slice of the real application, rebuilt from the same tokens: card radius,
	// hairline ring, no shadow. `muted` marks raw input — the thing you paste in —
	// so the eye can tell source from product without needing a legend. The label
	// is keyed so a figure that retitles its card (the morphing transcript demo)
	// swaps the words with a short fade instead of a snap.
	let {
		label,
		muted = false,
		children,
		class: className
	}: { label?: string; muted?: boolean; children: Snippet; class?: string } = $props();
</script>

<div
	class="flex min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-foreground/10 {muted
		? 'bg-muted/50'
		: 'bg-card'} {className ?? ''}"
>
	{#if label}
		<div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
			<span
				class="size-1.5 shrink-0 rounded-full {muted ? 'bg-muted-foreground/40' : 'bg-brand'}"
				aria-hidden="true"
			></span>
			{#key label}
				<span in:fade={{ duration: 250 }} class="eyebrow truncate">{label}</span>
			{/key}
		</div>
	{/if}
	{@render children()}
</div>
