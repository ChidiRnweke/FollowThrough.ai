<script lang="ts" module>
	import type { WidgetChange } from '$lib/models/widgets';
	import type { WidgetEditOutcome } from '$lib/stores/widgets/widget-edits.svelte';

	export type WidgetChangeHandler = (change: WidgetChange) => Promise<WidgetEditOutcome>;
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { createStateStore } from '@json-render/core';
	import { JsonUIProvider, Renderer } from '@json-render/svelte';
	import { diffWidgetData } from '$lib/services/widgets/edits';
	import { widgetDataSchema, type Widget, type WidgetData } from '$lib/models/widgets';
	import { widgetRegistry } from './registry';
	import UnsupportedElement from './elements/unsupported-element.svelte';
	import * as Field from '$lib/components/ui/field';

	/**
	 * Renders a widget with json-render and turns what its controls change into `data` changes.
	 * Without `onChange` the widget is shown read-only.
	 */
	let { widget, onChange }: { widget: Widget; onChange?: WidgetChangeHandler } = $props();

	// The data and revision this view last agreed with the record. A control change is diffed
	// against them; a record revision this view did not produce resets the store to the record.
	let observed: WidgetData = untrack(() => widget.data);
	let observedRevision = untrack(() => widget.dataRevision);
	let generation = $state(0);
	let failure = $state<string | null>(null);

	const store = $derived.by(() => {
		void generation;
		// The store copies along the changed path and never writes into its input, so the record
		// (a Svelte state proxy, which `structuredClone` refuses) is handed over as it is.
		return createStateStore(untrack(() => widget.data));
	});

	const spec = $derived({ root: widget.layout.root, elements: widget.layout.elements });

	const resetToRecord = () => {
		observed = widget.data;
		observedRevision = widget.dataRevision;
		generation += 1;
	};

	$effect(() => {
		if (widget.dataRevision !== untrack(() => observedRevision)) untrack(resetToRecord);
	});

	$effect(() => {
		const current = store;
		const handler = onChange;
		if (!handler) return;
		return current.subscribe(() => {
			// The store is the library's untyped state model, so it is read here, at the edge.
			const next = widgetDataSchema.safeParse(current.getSnapshot());
			if (!next.success) {
				failure = 'The widget produced data it cannot save.';
				resetToRecord();
				return;
			}
			const patch = diffWidgetData(observed, next.data);
			if (patch.length === 0) return;
			const change: WidgetChange = { kind: 'data', patch };
			observed = next.data;
			observedRevision += 1;
			void handler(change).then((outcome) => {
				failure = outcome.kind === 'failure' ? outcome.message : null;
				if (outcome.kind === 'failure') resetToRecord();
			});
		});
	});
</script>

<div data-slot="widget-view" data-widget-id={widget.id} class="flex flex-col gap-2">
	<Field.Set disabled={!onChange} class="min-w-0 gap-0">
		{#key store}
			<JsonUIProvider {store}>
				<Renderer {spec} registry={widgetRegistry} fallback={UnsupportedElement} />
			</JsonUIProvider>
		{/key}
	</Field.Set>
	{#if failure}
		<p role="alert" class="text-label text-destructive">{failure}</p>
	{/if}
</div>
