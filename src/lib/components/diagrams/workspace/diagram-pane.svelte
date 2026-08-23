<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		diagramEtag,
		type Diagram,
		type DiagramEtag,
		type DiagramId,
		type DiagramRevisionId
	} from '$lib/models/diagrams';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtClose as X } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { userFacingMessage } from '$lib/errors';
	import {
		getProjectDiagram,
		renameProjectDiagram,
		saveProjectDiagramDraft,
		publishProjectDiagram,
		listDiagramRevisions,
		getDiagramRevision,
		restoreDiagramRevision
	} from '$lib/remote/diagrams/diagrams.remote';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from '../drawio-embed.svelte';
	import DiagramPreview from '../diagram-preview.svelte';
	import DiagramStatus from './diagram-status.svelte';
	import DiagramTitle from './diagram-title.svelte';
	import DiagramVersionHistory from './diagram-version-history.svelte';

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
	let titleOverride = $state<
		{ readonly diagramId: DiagramId; readonly title: string } | undefined
	>();
	const title = $derived(
		titleOverride?.diagramId === diagramId
			? titleOverride.title
			: (current?.title ?? 'Untitled diagram')
	);

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
	let renaming = $state(false);
	let etag = $state<DiagramEtag | undefined>();
	let queuedSource = $state<string | undefined>();
	let autosaving = $state(false);
	let historyOpen = $state(false);
	let currentPreview = $state<string | undefined>();
	let selectedRevisionId = $state<DiagramRevisionId | undefined>();
	let mutationTail: Promise<void> = Promise.resolve();
	const history = $derived(listDiagramRevisions(diagramId));
	const selectedRevision = $derived(
		selectedRevisionId
			? getDiagramRevision({ diagramId, revisionId: selectedRevisionId })
			: undefined
	);
	const hasUnpublishedChanges = $derived(
		current?.kind === 'drawio' && current.currentRevision > current.publishedRevision
	);

	$effect(() => {
		if (current?.kind === 'drawio' && !autosaving && !renaming) etag = diagramEtag(current);
	});

	function mutate<T>(operation: (baseEtag: DiagramEtag) => Promise<T>): Promise<T> {
		const result = mutationTail.then(() => {
			if (!etag) throw new Error('The diagram revision is not ready.');
			return operation(etag);
		});
		// audit-allow: silent-catch — the returned operation promise propagates this failure; only the private serialization tail recovers
		mutationTail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	async function rename(title: string): Promise<void> {
		if (!current || current.kind !== 'drawio' || !etag) return;
		titleOverride = { diagramId, title };
		renaming = true;
		try {
			const renamed = await mutate((baseEtag) =>
				renameProjectDiagram({ diagramId, title, baseEtag }).updates(getProjectDiagram(diagramId))
			);
			etag = diagramEtag(renamed);
			store.describe({ title: renamed.title, projectId: renamed.projectId, kind: renamed.kind });
			toast.success('Diagram title saved');
			// audit-allow: silent-catch — the optimistic title is discarded and the save failure is shown.
		} catch (error) {
			titleOverride = undefined;
			toast.error(userFacingMessage(error, 'The diagram title could not be saved.'));
		} finally {
			renaming = false;
		}
	}

	async function publish(output: DrawioExport): Promise<void> {
		if (!etag) return;
		try {
			const result = await mutate((baseEtag) =>
				publishProjectDiagram({
					diagramId,
					source: output.xml,
					renderedSvg: output.svg,
					baseEtag
				}).updates(getProjectDiagram(diagramId))
			);
			etag = result.etag;
			await history.refresh();
			toast.success('Diagram published');
		} catch (error) {
			const message = userFacingMessage(error, 'The diagram could not be published.');
			toast.error(message);
			throw new Error(message, { cause: error });
		}
	}

	async function autosave(source: string): Promise<void> {
		queuedSource = source;
		if (autosaving) return;
		autosaving = true;
		try {
			while (queuedSource) {
				const next = queuedSource;
				queuedSource = undefined;
				const result = await mutate((baseEtag) =>
					saveProjectDiagramDraft({ diagramId, source: next, baseEtag }).updates(
						getProjectDiagram(diagramId)
					)
				);
				etag = result.etag;
			}
		} catch (error) {
			toast.error(userFacingMessage(error, 'The diagram draft could not be saved.'));
			throw error;
		} finally {
			autosaving = false;
		}
	}

	async function restore(revisionId: DiagramRevisionId): Promise<void> {
		if (!etag) return;
		const result = await mutate((baseEtag) =>
			restoreDiagramRevision({ diagramId, revisionId, baseEtag }).updates(
				getProjectDiagram(diagramId)
			)
		);
		etag = result.etag;
		historyOpen = false;
	}

	function openHistory(): void {
		if (editor.modified) control?.review();
		else currentPreview = current?.renderedSvg;
		historyOpen = true;
	}
</script>

<div class="flex h-full w-full min-w-0 flex-1 flex-col" data-diagram-pane={diagramId}>
	<!--
		One header, shaped like the chat pane's. The editor beneath says which kind
		of diagram this is, so nothing above it needs to caption it.
	-->
	<header class="flex min-h-10 shrink-0 items-center gap-2 px-4 pb-3 @[40rem]:px-8">
		<DiagramTitle {title} busy={renaming} oncommit={rename} />
		<DiagramStatus status={editor} onretry={() => control?.retry()} />
		{#if current?.kind === 'drawio'}
			<Button variant="ghost" size="sm" onclick={openHistory}>History</Button>
			<Button
				size="sm"
				disabled={busy ||
					autosaving ||
					queuedSource !== undefined ||
					(!hasUnpublishedChanges && !editor.modified)}
				onclick={() => control?.commit()}>Publish</Button
			>
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
				oncommit={publish}
				onautosave={autosave}
				onreview={(output) => (currentPreview = output.svg)}
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

{#if current?.kind === 'drawio'}
	<DiagramVersionHistory
		bind:open={historyOpen}
		diagram={current}
		currentPreview={currentPreview ?? current.renderedSvg}
		revisions={history.current?.revisions ?? []}
		selected={selectedRevision?.current?.revision}
		bind:selectedId={selectedRevisionId}
		onrestore={restore}
	/>
{/if}
