<script lang="ts">
	// Shared empty-state treatment (see DESIGN_SYSTEM.md "Empty states"):
	// a quiet icon, one voice line, an optional hint, an optional single action.
	// Empty regions are invitations to act, never dead blank space.
	//
	// Two sizes. The default slot size fills inline gaps (a grid cell, a side
	// panel) — all-muted, built to whisper. `large` is the hero treatment for a
	// region that carries a page or a whole section on its own: an icon tile, a
	// statement in foreground, one supporting line.
	import type { Component, Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		icon,
		title,
		hint,
		action,
		size = 'default',
		label,
		class: className
	}: {
		icon?: Component<{ class?: string }>;
		title: string;
		hint?: string;
		action?: Snippet;
		size?: 'default' | 'large';
		/** Accessible name for a page-level empty region. */
		label?: string;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

{#if size === 'large'}
	<section class={cn('flex flex-col items-center py-16 text-center', className)} aria-label={label}>
		{#if Icon}
			<div
				class="flex size-16 items-center justify-center rounded-lg bg-brand/10 text-brand dark:bg-brand/15"
			>
				<Icon class="size-8" />
			</div>
		{/if}
		<p class={cn('text-base font-medium', Icon && 'pt-4')}>{title}</p>
		{#if hint}
			<p class="max-w-sm pt-1.5 text-sm text-muted-foreground">{hint}</p>
		{/if}
		{#if action}
			<div class="pt-6">{@render action()}</div>
		{/if}
	</section>
{:else}
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
{/if}
