<script lang="ts">
	import { untrack } from 'svelte';
	import {
		widgetCatalog,
		widgetDataSchema,
		widgetLayoutSchema,
		type Widget,
		type WidgetChange,
		type WidgetIssue
	} from '$lib/models/widgets';
	import type { DateTime } from '$lib/models/workspace';
	import { applyWidgetChanges, widgetChangesBetween } from '$lib/services/widgets/edits';
	import { readJsonText } from '$lib/client/widgets/json-text';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import WidgetView from './widget-view.svelte';
	import { widgetSources } from '$lib/stores/widgets/widget-sources.svelte';

	/**
	 * Edit a widget as JSON. What is typed becomes changes through `widgetChangesBetween`, the
	 * preview is those changes applied by the same rule the server applies, and Apply stays off
	 * while anything would be refused.
	 */
	let {
		widget,
		onapply,
		oncancel
	}: {
		widget: Widget;
		onapply: (changes: readonly WidgetChange[]) => Promise<void>;
		oncancel: () => void;
	} = $props();

	let title = $state(untrack(() => widget.title));
	let layoutText = $state(untrack(() => JSON.stringify(widget.layout, null, '\t')));
	let dataText = $state(untrack(() => JSON.stringify(widget.data, null, '\t')));
	let applying = $state(false);

	const outcome = $derived.by(
		():
			| { kind: 'ready'; changes: readonly WidgetChange[]; preview: Widget }
			| { kind: 'invalid'; issues: readonly WidgetIssue[] } => {
			const layout = readJsonText(layoutText, widgetLayoutSchema, 'layout');
			const data = readJsonText(dataText, widgetDataSchema, 'data');
			if (layout.kind === 'failure' || data.kind === 'failure')
				return {
					kind: 'invalid',
					issues: [
						...(layout.kind === 'failure' ? layout.issues : []),
						...(data.kind === 'failure' ? data.issues : [])
					]
				};
			const changes = widgetChangesBetween(widget, {
				title,
				layout: layout.value,
				data: data.value
			});
			const applied = applyWidgetChanges(
				widget,
				changes,
				widgetCatalog,
				new Date().toISOString() as DateTime
			);
			if (applied.kind === 'applied') return { kind: 'ready', changes, preview: applied.widget };
			return {
				kind: 'invalid',
				issues:
					applied.kind === 'invalid'
						? applied.issues
						: [{ path: `/${applied.part}`, message: 'The widget changed. Reopen the editor.' }]
			};
		}
	);

	async function apply(): Promise<void> {
		if (outcome.kind !== 'ready' || outcome.changes.length === 0) return;
		applying = true;
		await onapply(outcome.changes);
		applying = false;
	}
</script>

<div data-slot="widget-json-editor" class="flex flex-col gap-4">
	<div class="flex flex-col gap-1.5">
		<Label for="widget-title">Title</Label>
		<Input id="widget-title" bind:value={title} />
	</div>
	<div class="grid gap-4 @[48rem]:grid-cols-2">
		<div class="flex flex-col gap-1.5">
			<Label for="widget-layout">Layout</Label>
			<!-- audit-allow: no-raw-font-family — the field holds JSON source, which is code. -->
			<Textarea
				id="widget-layout"
				bind:value={layoutText}
				spellcheck={false}
				class="h-72 resize-y font-mono text-xs field-sizing-fixed"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="widget-data">Data</Label>
			<!-- audit-allow: no-raw-font-family — the field holds JSON source, which is code. -->
			<Textarea
				id="widget-data"
				bind:value={dataText}
				spellcheck={false}
				class="h-72 resize-y font-mono text-xs field-sizing-fixed"
			/>
		</div>
	</div>
	{#if outcome.kind === 'invalid'}
		<ul role="alert" aria-label="Problems" class="flex flex-col gap-1 text-label text-destructive">
			{#each outcome.issues as issue, index (index)}
				<li><code>{issue.path}</code> {issue.message}</li>
			{/each}
		</ul>
	{/if}
	<div class="flex items-center justify-end gap-2">
		<Button variant="ghost" onclick={oncancel} disabled={applying}>Cancel</Button>
		<Button
			onclick={() => void apply()}
			disabled={applying || outcome.kind !== 'ready' || outcome.changes.length === 0}
			>{applying ? 'Applying…' : 'Apply'}</Button
		>
	</div>
	{#if outcome.kind === 'ready'}
		<div class="flex flex-col gap-1.5">
			<p class="eyebrow">Preview</p>
			<WidgetView widget={outcome.preview} sources={widgetSources(outcome.preview)} />
		</div>
	{/if}
</div>
