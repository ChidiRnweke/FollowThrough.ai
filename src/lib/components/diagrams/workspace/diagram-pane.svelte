<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Diagram, DiagramId } from '$lib/models/diagrams';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtClose as X } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { userFacingMessage } from '$lib/errors';
	import { getProjectDiagram, saveProjectDrawio } from '$lib/remote/diagrams/diagrams.remote';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from '../drawio-embed.svelte';
	import DiagramPreview from '../diagram-preview.svelte';
	import DiagramStatus from './diagram-status.svelte';

	let {
		diagramId,
		initial,
		onCloseSplit
	}: {
		diagramId: DiagramId;
		/** Server-loaded diagram, so the host route paints the canvas on first render. */
		initial?: Diagram;
		onCloseSplit?: () => void;
	} = $props();

	// The same acquire-on-mount / release-on-destroy lifetime the note and chat
	// panes use. `diagramId` is stable: the pane is keyed by its tab id.
	const store = untrack(() => diagramRegistry.for(diagramId));
	onDestroy(() => diagramRegistry.release(diagramId));

	const diagram = $derived(getProjectDiagram(diagramId));
	const current = $derived(diagram.current ?? initial);
	const title = $derived(current?.title ?? 'Untitled diagram');

	// The pane is the only thing that loads a diagram, so it is what tells the tab
	// strip and the workbench what this tab holds. This writes to state deliberately
	// rather than deriving it: the readers live in other components and reach the
	// value through the registry, the same way a chat pane publishes its title.
	$effect(() => {
		if (current)
			store.describe({ title: current.title, projectId: current.projectId, kind: current.kind });
	});

	let control = $state<DrawioControl | undefined>(undefined);
	let editor = $state<DrawioStatus>({ phase: 'loading', modified: false });
	const busy = $derived(editor.phase === 'exporting' || editor.phase === 'saving');

	/**
	 * Backfill the preview of a diagram that was saved without one.
	 *
	 * The agent used to be able to create a draw.io diagram through a route that
	 * never opened an editor, and such a row reads as "No preview yet" everywhere
	 * it is listed. That route is closed now, but the rows it made are still here,
	 * and this is the only place that can repair them: the export is the preview.
	 */
	async function capturePreview(output: DrawioExport): Promise<void> {
		try {
			await saveProjectDrawio({
				diagramId,
				source: output.xml,
				renderedSvg: output.svg
			}).updates(getProjectDiagram(diagramId));
		} catch {
			// Nothing was asked for, so nothing is reported: the diagram is on screen
			// either way, and the next open tries again.
		}
	}

	async function save(output: DrawioExport): Promise<void> {
		try {
			await saveProjectDrawio({
				diagramId,
				source: output.xml,
				renderedSvg: output.svg
			}).updates(getProjectDiagram(diagramId));
			toast.success('Diagram saved');
		} catch (error) {
			const message = userFacingMessage(error, 'The diagram could not be saved.');
			toast.error(message);
			throw new Error(message, { cause: error });
		}
	}
</script>

<div class="flex h-full w-full min-w-0 flex-1 flex-col" data-diagram-pane={diagramId}>
	<!--
		One header, shaped like the chat pane's. The editor beneath says which kind
		of diagram this is, so nothing above it needs to caption it.
	-->
	<header class="flex min-h-10 shrink-0 items-center gap-2 px-4 pb-3 @[40rem]:px-8">
		<h2 class="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
		<DiagramStatus status={editor} onretry={() => control?.retry()} />
		{#if current?.kind === 'drawio'}
			<Button size="sm" disabled={busy} onclick={() => control?.commit()}>Save diagram</Button>
		{/if}
		{#if onCloseSplit}
			<Tip text="Close split view">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label="Close split view"
						onclick={onCloseSplit}
					>
						<X />
					</Button>
				{/snippet}
			</Tip>
		{/if}
	</header>

	<!-- A flex column: the editor sizes itself against this, and a block parent
	     collapsed it to its 384px floor with the rest of the pane left blank. -->
	<div class="flex min-h-0 flex-1 flex-col px-4 pb-4 @[40rem]:px-8">
		{#if diagram.error}
			<p class="text-sm text-muted-foreground">
				This diagram could not be loaded. It may have been deleted.
			</p>
		{:else if !current}
			<p class="text-sm text-muted-foreground">Loading the diagram.</p>
		{:else if current.kind === 'drawio'}
			<DrawioEmbed
				xml={current.source}
				{title}
				oncommit={save}
				oncapturepreview={current.renderedSvg ? undefined : capturePreview}
				oncontrol={(value) => (control = value)}
				onstatus={(value) => (editor = value)}
			/>
		{:else}
			<!--
				A note-inline Mermaid diagram, reachable only by its own URL — the studio
				makes draw.io and the gallery lists draw.io. Shown, not edited: Mermaid
				is edited in the note that holds it.
			-->
			<div class="h-full overflow-auto">
				<DiagramPreview
					kind={current.kind}
					source={current.source}
					renderedSvg={current.renderedSvg}
					{title}
					class="max-w-full"
				/>
			</div>
		{/if}
	</div>
</div>
