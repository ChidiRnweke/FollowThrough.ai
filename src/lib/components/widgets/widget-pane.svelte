<script lang="ts">
	import { untrack } from 'svelte';
	import type { WidgetId } from '$lib/models/widgets';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import WidgetView from './widget-view.svelte';

	/** A widget opened on its own, in a workbench tab or at `/widgets/<id>`. */
	let { widgetId }: { widgetId: WidgetId } = $props();
	const editor = untrack(() => widgetEdits.editor(widgetId));
	void editor.open();
	const widget = $derived(editor.state.kind === 'ready' ? editor.value : null);
</script>

<div class="min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-6 pb-10" data-widget-pane={widgetId}>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-10">
		<header class="flex items-baseline gap-3">
			<h1 class="page-title min-w-0 flex-1 truncate">{widget?.title ?? 'Widget'}</h1>
			{#if editor.status === 'pending' || editor.status === 'saving'}
				<p class="text-xs text-muted-foreground" role="status">Saved on this device</p>
			{:else if editor.status === 'error'}
				<p class="text-xs text-destructive" role="alert">
					{editor.lastError ?? 'The widget could not be saved'}
				</p>
			{/if}
		</header>
		{#if widget}
			<WidgetView {widget} onEdit={(edit) => widgetEdits.stage(editor, widgetId, edit)} />
		{:else if editor.state.kind === 'failure'}
			<p role="alert" class="text-sm text-destructive">{editor.state.message}</p>
		{:else}
			<Skeleton class="h-40 w-full rounded-2xl" />
		{/if}
	</div>
</div>
