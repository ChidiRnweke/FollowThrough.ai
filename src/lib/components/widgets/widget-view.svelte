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
	import { resolveWidgetState, widgetDataOf } from '$lib/services/widgets/formulas';
	import {
		widgetDataSchema,
		type Widget,
		type WidgetData,
		type WidgetSourceRows,
		type WidgetSources
	} from '$lib/models/widgets';
	import { widgetRegistry } from './registry';
	import UnsupportedElement from './elements/unsupported-element.svelte';
	import * as Field from '$lib/components/ui/field';

	/**
	 * Renders a widget with json-render and turns what its controls change into `data` changes.
	 * Without `onChange` the widget is shown read-only. `sources` are the rows its workspace
	 * sources show, which the caller reads (`widgetSources`) because it knows where it runs.
	 */
	let {
		widget,
		sources,
		onChange
	}: { widget: Widget; sources: WidgetSources; onChange?: WidgetChangeHandler } = $props();

	const rowsOf = (value: WidgetSources): WidgetSourceRows =>
		value.kind === 'rows' ? value.rows : {};

	/** Controls write the store on every keystroke; one change is handed over per pause. */
	const PAUSE_MS = 350;

	// The data this view last agreed with the record. A control change is diffed against it, and
	// a record that differs from it changed elsewhere (sync, an agent, another view).
	let observed: WidgetData = untrack(() => widget.data);
	let failure = $state<string | null>(null);
	let pending: (() => void) | undefined;
	/** Changes handed over whose write to the local queue has not finished yet. */
	let staging = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	// One store for the life of the view, holding the data and the values computed from it. The
	// store copies along the changed path and never writes into its input.
	const initial = untrack(() => resolveWidgetState(widget.layout, widget.data, rowsOf(sources)));
	const store = createStateStore(initial.state);
	let formulaIssues = $state(initial.issues);

	const spec = $derived({ root: widget.layout.root, elements: widget.layout.elements });

	/** The data the controls hold now. The store is the library's untyped model, read at the edge. */
	const currentData = () => widgetDataSchema.safeParse(widgetDataOf(store.getSnapshot()));

	/** Bring the store to `data` key by key, so mounted controls keep their focus. */
	const adopt = (data: WidgetData) => {
		const { state, issues } = resolveWidgetState(widget.layout, data, rowsOf(sources));
		const keys = new Set([...Object.keys(store.getSnapshot()), ...Object.keys(state)]);
		store.update(Object.fromEntries([...keys].map((key) => [`/${key}`, state[key]])));
		formulaIssues = issues;
		observed = data;
	};

	/** Work the formulas out again after a control changed the data or the layout changed. */
	const recompute = () => {
		const data = currentData();
		if (!data.success) return;
		const { state, issues } = resolveWidgetState(widget.layout, data.data, rowsOf(sources));
		formulaIssues = issues;
		for (const root of ['sources', 'derived'] as const)
			if (JSON.stringify(store.get(`/${root}`)) !== JSON.stringify(state[root]))
				store.set(`/${root}`, state[root]);
	};

	// Formulas follow every keystroke, before the change is handed over, so a result is live.
	$effect(() => store.subscribe(recompute));

	// A layout edit, or a todo or note changing under a dashboard, works the values out again.
	$effect(() => {
		void widget.layout;
		void sources;
		untrack(recompute);
	});

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
				const next = currentData();
				if (!next.success) {
					failure = 'The widget produced data it cannot save.';
					adopt(widget.data);
					return;
				}
				const patch = diffWidgetData(observed, next.data);
				if (patch.length === 0) return;
				observed = next.data;
				const change: WidgetChange = { kind: 'data', patch };
				staging += 1;
				void handler(change)
					.then((outcome) => {
						failure = outcome.kind === 'failure' ? outcome.message : null;
						if (outcome.kind === 'failure') adopt(widget.data);
					})
					.finally(() => (staging -= 1));
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

	/**
	 * A reload inside the pause, or before the queue write lands, would drop the last edit: the
	 * write is asynchronous and `pagehide` does not wait for it. Hand the edit over now, and ask
	 * the browser to hold the page while it is still being written, as the note editor does.
	 */
	function onbeforeunload(event: BeforeUnloadEvent): void {
		flush();
		if (staging > 0) event.preventDefault();
	}
</script>

<svelte:window {onbeforeunload} />

<div data-slot="widget-view" data-widget-id={widget.id} class="@container flex flex-col gap-2">
	<Field.Set disabled={!onChange} class="min-w-0 gap-0">
		<JsonUIProvider {store}>
			<Renderer {spec} registry={widgetRegistry} fallback={UnsupportedElement} />
		</JsonUIProvider>
	</Field.Set>
	{#if failure}
		<p role="alert" class="text-label text-destructive">{failure}</p>
	{/if}
	{#if widget.layout.sources && sources.kind === 'unavailable'}
		<p role="status" class="text-label text-muted-foreground">
			This widget shows workspace data, which is not loaded here.
		</p>
	{/if}
	{#if formulaIssues.length > 0}
		<ul
			data-slot="widget-formula-issues"
			class="flex flex-col gap-0.5 text-label text-muted-foreground"
		>
			{#each formulaIssues as issue (issue.path)}
				<li>{issue.path.split('/').at(-1)}: {issue.message}</li>
			{/each}
		</ul>
	{/if}
</div>
