<script lang="ts">
	import type { NodeViewProps } from '@tiptap/core';
	import type { Component } from 'svelte';
	import type { DrawioPreviewProps, DrawioReferenceView } from './commands/nodes.js';
	import { Button } from '$lib/components/ui/button';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { NodeViewWrapper } from './index.js';

	const { node, extension }: NodeViewProps = $props();
	const options = $derived(
		extension.options as {
			getDiagram?: (reference: string) => DrawioReferenceView | undefined;
			resolveHref?: (reference: string) => string | undefined;
			preview?: Component<DrawioPreviewProps>;
		}
	);
	const reference = $derived(node.attrs.diagramId as string);
	const diagram = $derived(options.getDiagram?.(reference));
	const href = $derived(options.resolveHref?.(reference));
	const Preview = $derived(options.preview);
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
		{#if href}
			<Button {href} variant="ghost" size="sm">
				<ExternalLink />
				Open in draw.io
			</Button>
		{/if}
	</div>
	<div class="flex min-h-24 items-center justify-center overflow-x-auto bg-background p-4">
		{#if diagram?.renderedSvg && Preview}
			<Preview
				svg={diagram.renderedSvg}
				alt={diagram?.title ? `Preview of ${diagram.title}` : 'draw.io diagram preview'}
				class="max-h-96 max-w-full"
			/>
		{:else}
			<p class="text-sm text-muted-foreground">Preview unavailable</p>
		{/if}
	</div>
</NodeViewWrapper>
