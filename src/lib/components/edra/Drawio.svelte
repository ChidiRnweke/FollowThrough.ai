<script lang="ts">
	import type { NodeViewProps } from '@tiptap/core';
	import type { DiagramId, DrawioDiagram } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { NodeViewWrapper } from './index.js';
	import SafeSvgPreview from '$lib/components/app/safe-svg-preview.svelte';

	const { node, extension }: NodeViewProps = $props();
	const options = $derived(
		extension.options as {
			getDiagram?: (diagramId: DiagramId) => DrawioDiagram | undefined;
			getNoteId?: () => string;
		}
	);
	const diagramId = $derived(node.attrs.diagramId as DiagramId);
	const diagram = $derived(options.getDiagram?.(diagramId));
	const noteId = $derived(options.getNoteId?.());
</script>

<NodeViewWrapper
	class="diagram-node my-4! overflow-hidden rounded-md border border-border"
	contenteditable={false}
>
	<div class="flex min-h-11 items-center gap-2 border-b border-border px-3 py-2">
		<Workflow class="size-4 text-primary" />
		<p class="min-w-0 flex-1 truncate text-sm font-medium">
			{diagram?.title ?? 'draw.io diagram'}
		</p>
		<span class="text-xs text-muted-foreground" role="status">
			{diagram ? 'Saved' : 'Loading…'}
		</span>
		{#if noteId}
			<Button
				href={`/notes/${noteId}/diagrams/${diagramId}`}
				variant="ghost"
				size="sm"
				title="Open this diagram in draw.io"
			>
				<ExternalLink />
				Open in draw.io
			</Button>
		{/if}
	</div>
	<div class="flex min-h-24 items-center justify-center overflow-x-auto bg-background p-4">
		{#if diagram?.renderedSvg}
			<SafeSvgPreview
				svg={diagram.renderedSvg}
				alt={diagram?.title ? `Preview of ${diagram.title}` : 'draw.io diagram preview'}
				class="max-h-96 max-w-full"
			/>
		{:else}
			<p class="text-sm text-muted-foreground">Preview unavailable</p>
		{/if}
	</div>
</NodeViewWrapper>
