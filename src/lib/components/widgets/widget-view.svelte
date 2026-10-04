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

	/** Controls write the store on every keystroke; one change is handed over per pause. */
	const PAUSE_MS = 350;

	// The data this view last agreed with the record. A control change is diffed against it, and
	// a record that differs from it changed elsewhere (sync, an agent, another view).
	let observed: WidgetData = untrack(() => widget.data);
	let failure = $state<string | null>(null);
	let pending: (() => void) | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	// One store for the life of the view. The store copies along the changed path and never writes
	// into its input, so the record (a Svelte state proxy) is handed over as it is.
	const store = createStateStore(untrack(() => widget.data));

	const spec = $derived({ root: widget.layout.root, elements: widget.layout.elements });

	/** Bring the store to `data` key by key, so mounted controls keep their focus. */
	const adopt = (data: WidgetData) => {
		const keys = new Set([...Object.keys(store.getSnapshot()), ...Object.keys(data)]);
		store.update(Object.fromEntries([...keys].map((key) => [`/${key}`, data[key]])));
		observed = data;
	};

	const flush = () => {
		clearTimeout(timer);
		timer = undefined;
		const send = pending;
		pending = undefined;
		send?.();
	};

	$effect(() => {
		const data = widget.data;
		untrack(() => {
			// While a change is waiting, the record is about to change because of it.
			if (pending === undefined && diffWidgetData(observed, data).length > 0) adopt(data);
		});
	});

	$effect(() => {
		const handler = onChange;
		if (!handler) return;
		const unsubscribe = store.subscribe(() => {
			pending = () => {
				// The store is the library's untyped state model, so it is read here, at the edge.
				const next = widgetDataSchema.safeParse(store.getSnapshot());
				if (!next.success) {
					failure = 'The widget produced data it cannot save.';
					adopt(widget.data);
					return;
				}
				const patch = diffWidgetData(observed, next.data);
				if (patch.length === 0) return;
				observed = next.data;
				const change: WidgetChange = { kind: 'data', patch };
				void handler(change).then((outcome) => {
					failure = outcome.kind === 'failure' ? outcome.message : null;
					if (outcome.kind === 'failure') adopt(widget.data);
				});
			};
			clearTimeout(timer);
			timer = setTimeout(flush, PAUSE_MS);
		});
		const onHidden = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		window.addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', onHidden);
		return () => {
			unsubscribe();
			window.removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onHidden);
			// Leaving the view still hands over what was typed.
			flush();
		};
	});
</script>

<div data-slot="widget-view" data-widget-id={widget.id} class="flex flex-col gap-2">
	<Field.Set disabled={!onChange} class="min-w-0 gap-0">
		<JsonUIProvider {store}>
			<Renderer {spec} registry={widgetRegistry} fallback={UnsupportedElement} />
		</JsonUIProvider>
	</Field.Set>
	{#if failure}
		<p role="alert" class="text-label text-destructive">{failure}</p>
	{/if}
</div>
