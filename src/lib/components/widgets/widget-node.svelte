<script lang="ts">
	import type { NodeViewProps } from '@tiptap/core';
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { WidgetId } from '$lib/models/widgets';
	import NodeViewWrapper from '$lib/components/edra/NodeViewWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { FtExternal as OpenIcon } from '$lib/components/icons';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import WidgetView from './widget-view.svelte';

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
		{#if widget && widgetId}
			<div class="flex items-center justify-end">
				<!-- The editor cancels link clicks inside node views, so the link navigates itself; the
				     href stays for opening in a new tab. -->
				<Button
					variant="ghost"
					size="xs"
					href={`/widgets/${widgetId}`}
					class="text-muted-foreground"
					onclick={(event: MouseEvent) => {
						if (event.metaKey || event.ctrlKey || event.shiftKey) return;
						event.preventDefault();
						void goto(`/widgets/${widgetId}`);
					}}
				>
					<OpenIcon />
					Open widget
				</Button>
			</div>
			<WidgetView
				{widget}
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
