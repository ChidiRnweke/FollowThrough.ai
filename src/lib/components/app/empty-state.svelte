<script lang="ts">
	// Shared empty-state treatment (see DESIGN_SYSTEM.md "Empty states"):
	// a quiet icon, one voice line, an optional hint, an optional single action.
	// Empty regions are invitations to act, never dead blank space.
	import type { Component, Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		icon,
		title,
		hint,
		action,
		class: className
	}: {
		icon?: Component<{ class?: string }>;
		title: string;
		hint?: string;
		action?: Snippet;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<div class={cn('flex flex-col items-center justify-center gap-1.5 py-6 text-center', className)}>
	{#if Icon}
		<Icon class="size-5 text-muted-foreground/50" />
	{/if}
	<p class="text-sm text-muted-foreground">{title}</p>
	{#if hint}
		<p class="text-xs text-muted-foreground/70">{hint}</p>
	{/if}
	{#if action}
		<div class="pt-1">{@render action()}</div>
	{/if}
</div>
