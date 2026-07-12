<script lang="ts">
	import type { Provenance, SourceAnchor } from '$lib/models';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import { provenanceCaption } from './labels';

	let {
		provenance,
		anchor,
		sourceTitle,
		href
	}: {
		provenance: Provenance;
		anchor?: SourceAnchor;
		sourceTitle?: string;
		href?: string;
	} = $props();
</script>

<HoverCard.Root>
	<HoverCard.Trigger
		class="inline-flex size-4 items-center justify-center rounded-full"
		aria-label="AI provenance"
	>
		<span class="size-2 rounded-full bg-primary"></span>
	</HoverCard.Trigger>
	<HoverCard.Content class="w-72 space-y-1">
		<p class="provenance-caption">{provenanceCaption(provenance, sourceTitle)}</p>
		{#if anchor}
			<blockquote class="border-l-2 border-border pl-2 text-sm text-muted-foreground">
				{anchor.quote}
			</blockquote>
		{/if}
		{#if href}
			<a class="text-sm text-primary hover:underline" {href}>Jump to source</a>
		{/if}
	</HoverCard.Content>
</HoverCard.Root>
