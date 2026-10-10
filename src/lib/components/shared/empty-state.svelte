<script lang="ts">
	// Shared empty-state treatment (see docs/design/design-system.md "Empty states"):
	// a quiet icon, one voice line, an optional hint, an optional single action.
	// Empty regions are invitations to act, never dead blank space.
	//
	// Two sizes. The default slot size fills inline gaps (a grid cell, a side
	// panel) — all-muted, built to whisper, with a plain icon. `large` is the hero
	// treatment for a region that carries a page or a whole section on its own: a
	// drawn scene, a statement in foreground, one supporting line.
	import type { Component, Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type GlyphComponent = Component<{ class?: string }>;
	type Shared = {
		title: string;
		hint?: string;
		action?: Snippet;
		class?: string;
	};

	type Slot = { size?: 'default'; icon?: GlyphComponent };
	type Hero = {
		size: 'large';
		scene: GlyphComponent;
		/** Accessible name for the page-level empty region. */
		label?: string;
	};

	let props: Shared & (Slot | Hero) = $props();

	const hero = $derived(props.size === 'large' ? props : undefined);
	const Glyph = $derived(props.size === 'large' ? undefined : props.icon);
</script>

{#if hero}
	<section
		class={cn('flex flex-col items-center py-16 text-center', props.class)}
		aria-label={hero.label}
	>
		<hero.scene class="size-24 text-muted-foreground" />
		<p class="pt-4 text-base font-medium">{props.title}</p>
		{#if props.hint}
			<p class="max-w-sm pt-1.5 text-sm text-muted-foreground">{props.hint}</p>
		{/if}
		{#if props.action}
			<div class="pt-6">{@render props.action()}</div>
		{/if}
	</section>
{:else}
	<div
		class={cn('flex flex-col items-center justify-center gap-1.5 py-6 text-center', props.class)}
	>
		{#if Glyph}
			<Glyph class="size-5 text-muted-foreground/50" />
		{/if}
		<p class="text-sm text-muted-foreground">{props.title}</p>
		{#if props.hint}
			<p class="text-xs text-muted-foreground/70">{props.hint}</p>
		{/if}
		{#if props.action}
			<div class="pt-1">{@render props.action()}</div>
		{/if}
	</div>
{/if}
