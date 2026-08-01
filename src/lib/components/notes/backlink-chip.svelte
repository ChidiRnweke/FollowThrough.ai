<script lang="ts">
	import type { BacklinkView } from '$lib/models/relationships';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import { Badge } from '$lib/components/ui/badge';
	import { FtLink as Link2, FtWarning as TriangleAlert } from '$lib/components/icons';
	import { formatDateTime, relationshipLabels } from '../shared/labels';

	let {
		backlink,
		direction = 'out'
	}: {
		backlink: BacklinkView;
		direction?: 'in' | 'out';
	} = $props();

	const other = $derived(direction === 'out' ? backlink.targetNote : backlink.sourceNote);
	const contradicts = $derived(backlink.relationship.kind === 'contradicts');
</script>

<HoverCard.Root>
	<HoverCard.Trigger>
		{#snippet child({ props })}
			<Badge
				{...props}
				variant="secondary"
				href="/notes/{other.id}"
				class={contradicts
					? 'bg-warning/15 text-warning-foreground dark:bg-warning/20 dark:text-warning'
					: ''}
			>
				{#if contradicts}
					<TriangleAlert class="size-3.5 text-warning" />
				{:else}
					<Link2 class="size-3.5" />
				{/if}
				{other.title}
			</Badge>
		{/snippet}
	</HoverCard.Trigger>
	<HoverCard.Content class="w-72 space-y-1">
		<p class="text-xs font-medium {contradicts ? 'text-warning' : 'text-muted-foreground'}">
			{relationshipLabels[backlink.relationship.kind]}
		</p>
		{#if backlink.relationship.justification}
			<p class="text-sm text-muted-foreground">{backlink.relationship.justification}</p>
		{/if}
		<p class="provenance-caption">
			{formatDateTime(backlink.relationship.createdAt)}
		</p>
	</HoverCard.Content>
</HoverCard.Root>
