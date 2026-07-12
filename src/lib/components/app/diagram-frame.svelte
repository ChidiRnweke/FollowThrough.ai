<script lang="ts">
	import type { Diagram, DiagramId } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';

	let {
		diagram,
		onedit,
		onpromote,
		onregenerate
	}: {
		diagram: Diagram;
		onedit?: (diagramId: DiagramId) => void;
		onpromote?: (diagramId: DiagramId) => void;
		onregenerate?: (diagramId: DiagramId) => void;
	} = $props();

	const hasActions = $derived(
		onedit !== undefined || onpromote !== undefined || onregenerate !== undefined
	);
</script>

<Card.Root class="gap-2 py-3">
	<Card.Header class="px-4">
		<Card.Title class="flex items-center gap-2 text-sm font-medium">
			<Badge variant="outline" class="font-mono">{diagram.kind}</Badge>
			{diagram.title ?? 'Untitled diagram'}
		</Card.Title>
		{#if hasActions}
			<Card.Action>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon-sm" aria-label="Diagram actions">
								<EllipsisVertical class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						{#if onedit}
							<DropdownMenu.Item onclick={() => onedit(diagram.id)}>Edit</DropdownMenu.Item>
						{/if}
						{#if onpromote && diagram.kind === 'mermaid'}
							<DropdownMenu.Item onclick={() => onpromote(diagram.id)}>
								Promote to draw.io
							</DropdownMenu.Item>
						{/if}
						{#if onregenerate && diagram.kind === 'mermaid'}
							<DropdownMenu.Item onclick={() => onregenerate(diagram.id)}>
								Regenerate
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="px-4">
		{#if diagram.renderedSvg}
			<div class="overflow-x-auto [&_svg]:h-auto [&_svg]:max-h-80 [&_svg]:max-w-full">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG produced by trusted render pipeline -->
				{@html diagram.renderedSvg}
			</div>
		{:else}
			<div class="space-y-2 rounded-md bg-muted/50 p-3">
				<p class="text-sm text-muted-foreground">This diagram has not rendered.</p>
				<pre class="overflow-x-auto font-mono text-xs text-muted-foreground">{diagram.source}</pre>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
