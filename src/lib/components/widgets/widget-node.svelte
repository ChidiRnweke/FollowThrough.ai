<script lang="ts">
	import type { NodeViewProps } from '@tiptap/core';
	import { untrack } from 'svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { widgetTab } from '$lib/stores/workbench/tab-ref';
	import type { WidgetId } from '$lib/models/widgets';
	import NodeViewWrapper from '$lib/components/edra/NodeViewWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import WidgetView from './widget-view.svelte';
	import { widgetSources } from '$lib/stores/widgets/widget-sources.svelte';

	let { node, editor }: NodeViewProps = $props();

	// Review panes render notes read-only and without the per-note stores. There the widget
	// is shown as it is saved, and nothing in it can change. Both facts are fixed for the
	// lifetime of a mounted node view, so they are read once.
	const editable = untrack(() => editor.isEditable && editor.perNote !== undefined);
	const widgetId = untrack(() => node.attrs.widgetId as WidgetId | null);
	const draft =
		widgetId && editable && workspaceSession.current ? widgetEdits.editor(widgetId) : null;
	if (draft) void draft.open();

	const widget = $derived(
		draft
			? draft.state.kind === 'ready'
				? draft.value
				: null
			: widgetId
				? (workspaceSession.current?.resources.views.get('widgets', widgetId) ?? null)
				: null
	);
</script>

<NodeViewWrapper class="my-2" data-widget-node={widgetId}>
	<div contenteditable="false" class="flex flex-col gap-1.5">
		{#if widget?.archivedAt && widgetId}
			<!-- Shown, not dropped: the note still holds the reference and the widget can come back. -->
			<div
				class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10 ring-inset"
			>
				<span class="min-w-0 flex-1">“{widget.title}” is in the trash.</span>
				{#if editable}
					<Button
						variant="outline"
						size="sm"
						onclick={() => void widgetEdits.changeTrash(widgetId, 'restore')}>Restore</Button
					>
				{/if}
			</div>
		{:else if widget && widgetId}
			<div class="flex items-center justify-end">
				<!-- The editor cancels link clicks inside node views, so the link opens the widget's
				     workbench tab itself, behind the note on ctrl/⌘ as note links do. The href stays for a
				     new browser tab. -->
				<Button
					variant="ghost"
					size="xs"
					href={`/widgets/${widgetId}`}
					class="text-muted-foreground"
					onclick={(event: MouseEvent) => {
						if (event.shiftKey) return;
						event.preventDefault();
						const tab = widgetTab(widgetId);
						void (event.metaKey || event.ctrlKey
							? workbench.openTabInBackground(tab)
							: workbench.openTab(tab));
					}}
				>
					<Icon.External />
					Open widget
				</Button>
			</div>
			<WidgetView
				{widget}
				sources={widgetSources(widget)}
				onChange={draft ? (change) => widgetEdits.stage(draft, widgetId, change) : undefined}
			/>
			{#if draft?.status === 'error'}
				<p role="alert" class="text-label text-destructive">
					{draft.lastError ?? 'The widget could not be saved'}
				</p>
			{/if}
		{:else if draft?.state.kind === 'failure'}
			<p class="text-sm text-muted-foreground">This widget is no longer available.</p>
		{:else}
			<p class="text-sm text-muted-foreground">Embedded widget</p>
		{/if}
	</div>
</NodeViewWrapper>
