<script lang="ts">
	import { untrack } from 'svelte';
	import type { WidgetId } from '$lib/models/widgets';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as Icon from '$lib/components/icons';
	import WidgetView from './widget-view.svelte';
	import { widgetSources } from '$lib/stores/widgets/widget-sources.svelte';
	import WidgetJsonEditor from './widget-json-editor.svelte';
	import type { WidgetChange } from '$lib/models/widgets';

	/** A widget opened on its own, in a workbench tab or at `/widgets/<id>`. */
	let { widgetId, onCloseSplit }: { widgetId: WidgetId; onCloseSplit?: () => void } = $props();
	const editor = untrack(() => widgetEdits.editor(widgetId));
	void editor.open();
	const widget = $derived(editor.state.kind === 'ready' ? editor.value : null);
	let editing = $state(false);

	/** Stage the editor's changes in order; a refused one stops the rest and keeps the editor open. */
	async function apply(changes: readonly WidgetChange[]): Promise<void> {
		for (const change of changes) {
			const outcome = await widgetEdits.stage(editor, widgetId, change);
			if (outcome.kind === 'failure') return;
		}
		editing = false;
	}
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
			{#if widget && !widget.archivedAt}
				<Button variant="outline" size="sm" onclick={() => (editing = !editing)}
					>{editing ? 'Done' : 'Edit'}</Button
				>
			{/if}
			{#if onCloseSplit}
				<div class="ms-4 flex shrink-0 items-center self-center">
					<Tip text="Close split view">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Close split view"
								onclick={onCloseSplit}
							>
								<Icon.Close />
							</Button>
						{/snippet}
					</Tip>
				</div>
			{/if}
		</header>
		{#if widget && editing}
			<WidgetJsonEditor {widget} onapply={apply} oncancel={() => (editing = false)} />
		{:else if widget}
			<WidgetView
				{widget}
				sources={widgetSources(widget)}
				onChange={(change) => widgetEdits.stage(editor, widgetId, change)}
			/>
		{:else if editor.state.kind === 'failure'}
			<p role="alert" class="text-sm text-destructive">{editor.state.message}</p>
		{:else}
			<Skeleton class="h-40 w-full rounded-2xl" />
		{/if}
	</div>
</div>
