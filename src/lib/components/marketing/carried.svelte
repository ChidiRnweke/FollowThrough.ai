<script lang="ts">
	import type { Snippet } from 'svelte';

	// Marks a fact on both sides of the demo so you can trace it by eye.
	// `derived` is the important variant: a dotted underline for facts the agent
	// worked out rather than copied. Without the distinction "Fri 31 Jul" looks
	// like it was sitting in the transcript, which is the opposite of the point.
	let { children, derived = false }: { children: Snippet; derived?: boolean } = $props();
</script>

<mark
	class="rounded-xs px-1 py-0.5 text-foreground {derived
		? 'bg-brand/10 underline decoration-brand decoration-dotted decoration-2 underline-offset-4 dark:bg-brand/15'
		: 'bg-brand/12 dark:bg-brand/20'}"
>
	{@render children()}
</mark>
