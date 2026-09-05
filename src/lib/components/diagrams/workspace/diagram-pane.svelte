<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type {
		Diagram,
		DiagramId,
		DiagramRevisionId,
		DrawioDiagram,
		DiagramWriteOutcome
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
	import {
		DiagramSaveCoordinator,
		type DiagramSaveSnapshot,
		type DiagramSaveResult,
		type DiagramSaveStatus
	} from '$lib/client/diagrams/save-coordinator';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from '../drawio-embed.svelte';
	import DiagramPreview from '../diagram-preview.svelte';
	import DiagramStatus from './diagram-status.svelte';
	import DiagramTitle from './diagram-title.svelte';
	import DiagramVersionHistory from './diagram-version-history.svelte';
	import DiagramConflictDialog from './diagram-conflict-dialog.svelte';

	let {
		diagramId,
		initial,
		onCloseSplit
	}: {
		diagramId: DiagramId;
		initial?: Diagram;
		onCloseSplit?: () => void;
	} = $props();

	const store = untrack(() => diagramRegistry.for(diagramId));
	onDestroy(() => diagramRegistry.release(diagramId));
	const diagram = $derived(getProjectDiagram(diagramId));
	const loaded = $derived(diagram.current ?? initial);
	let snapshot = $state<DiagramSaveSnapshot>();
	let coordinator: DiagramSaveCoordinator | undefined;
	const current = $derived(snapshot?.diagram ?? loaded);
	const title = $derived(snapshot?.local.title ?? current?.title ?? 'Untitled diagram');
	let control = $state<DrawioControl>();
	let editor = $state<DrawioStatus>({ phase: 'loading', modified: false });
	let renaming = $state(false);
	let restoring = $state(false);
	let historyOpen = $state(false);
	let conflictOpen = $state(false);
	let reviewConflict = $state.raw<Extract<DiagramSaveStatus, { kind: 'conflict' }>>();
	let capturedConflict: DiagramSaveStatus | undefined;
	let selectedRevisionId = $state<DiagramRevisionId>();
	const history = $derived(listDiagramRevisions(diagramId));
	const selectedRevision = $derived(
		selectedRevisionId
			? getDiagramRevision({ diagramId, revisionId: selectedRevisionId })
			: undefined
	);
	const conflict = $derived(snapshot?.status.kind === 'conflict' ? snapshot.status : undefined);
	const autosaving = $derived(snapshot?.status.kind === 'saving');
	const busy = $derived(editor.phase === 'exporting' || editor.phase === 'saving' || restoring);
	const hasUnpublishedChanges = $derived(
		current?.kind === 'drawio' && current.currentRevision > current.publishedRevision
	);

	function describe(value: DrawioDiagram): void {
		store.describe({ title: value.title, projectId: value.projectId, kind: value.kind });
	}

	$effect(() => {
		const value = loaded;
		if (!value) return;
		untrack(() => {
			if (value.kind !== 'drawio') {
				store.describe({ title: value.title, projectId: value.projectId, kind: value.kind });
				return;
			}
			if (!coordinator) {
				coordinator = new DiagramSaveCoordinator(
					value,
					{
						save: async (input) => accept(await saveProjectDiagramDraft(input)),
						rename: async (input) => accept(await renameProjectDiagram(input)),
						publish: async (input) => accept(await publishProjectDiagram(input)),
						restore: async (input) => accept(await restoreDiagramRevision(input))
					},
					(next) => {
						snapshot = next;
						describe(next.local);
						if (next.status.kind === 'conflict' && next.status !== reviewConflict) {
							reviewConflict = next.status;
							conflictOpen = true;
						}
					},
					(replacement) => control?.replace(replacement.source)
				);
			} else coordinator.observe(value);
		});
	});

	function accept(result: DiagramWriteOutcome): DiagramWriteOutcome {
		if (result.outcome === 'saved') getProjectDiagram(diagramId).set(result.diagram);
		return result;
	}

	function saves(): DiagramSaveCoordinator {
		if (!coordinator) throw new Error('The diagram is still loading.');
		return coordinator;
	}

	function requireSaved(result: DiagramSaveResult): void {
		if (result.kind === 'conflict')
			throw new Error('This diagram changed somewhere else. Review the versions before saving.');
		if (result.kind === 'failure') throw new Error(result.message);
	}

	async function refreshHistory(): Promise<void> {
		try {
			await history.refresh();
			// audit-allow: silent-catch — publication is already saved; the toast reports that only refreshing history failed.
		} catch (error) {
			toast.error(
				userFacingMessage(
					error,
					'The diagram was saved, but version history could not be refreshed.'
				)
			);
		}
	}

	async function rename(value: string): Promise<void> {
		renaming = true;
		try {
			requireSaved(await saves().rename(value));
			// audit-allow: silent-catch — retained title and visible toast let the user retry the failed rename.
		} catch (error) {
			toast.error(userFacingMessage(error, 'The diagram title could not be saved.'));
		} finally {
			renaming = false;
		}
	}

	async function autosave(source: string): Promise<void> {
		requireSaved(await saves().save(source));
	}

	async function publish(output: DrawioExport): Promise<void> {
		requireSaved(await saves().publish(output.xml, output.svg));
		toast.success('Diagram published');
		await refreshHistory();
	}

	async function retry(): Promise<void> {
		requireSaved(await saves().retry());
		await refreshHistory();
	}

	async function retryFromHeader(): Promise<void> {
		if (editor.phase === 'failed') {
			control?.retry();
			return;
		}
		try {
			await retry();
			// audit-allow: silent-catch — a failed title retry remains in the coordinator and is reported by the toast and header.
		} catch (error) {
			toast.error(userFacingMessage(error, 'The diagram could not be saved.'));
		}
	}

	async function restore(revisionId: DiagramRevisionId): Promise<void> {
		restoring = true;
		try {
			requireSaved(await saves().restore(revisionId));
			historyOpen = false;
		} finally {
			restoring = false;
		}
	}

	async function useRemote(): Promise<void> {
		if (!reviewConflict) throw new Error('There is no diagram conflict to resolve.');
		saves().useRemote(reviewConflict.remote);
		getProjectDiagram(diagramId).set(reviewConflict.remote);
		conflictOpen = false;
		reviewConflict = undefined;
		await refreshHistory();
	}

	async function keepLocal(): Promise<void> {
		requireSaved(await saves().keepLocal());
		if (!saves().snapshot.dirty) control?.acknowledge();
		conflictOpen = false;
		reviewConflict = undefined;
		// Resolution only saves a draft. Publication is a separate, explicit gesture.
	}

	function openHistory(): void {
		control?.review();
		historyOpen = true;
	}
</script>

<div class="flex h-full w-full min-w-0 flex-1 flex-col" data-diagram-pane={diagramId}>
	<!--
		One header, shaped like the chat pane's. The editor beneath says which kind
		of diagram this is, so nothing above it needs to caption it.
	-->
	<header class="flex min-h-10 shrink-0 items-center gap-2 px-4 pb-3 @[40rem]:px-8">
		<DiagramTitle {title} busy={renaming || restoring || !!conflict} oncommit={rename} />
		{#if conflict}
			<Button variant="outline" size="sm" onclick={() => (conflictOpen = true)}
				>Review conflict</Button
			>
		{:else if snapshot?.status.kind === 'failure'}
			<DiagramStatus
				status={{ phase: 'failed', modified: true, failure: snapshot.status.message }}
				onretry={() => void retryFromHeader()}
			/>
		{:else}
			<DiagramStatus status={editor} onretry={() => control?.retry()} />
		{/if}
		{#if current?.kind === 'drawio'}
			<Button variant="ghost" size="sm" disabled={busy} onclick={openHistory}>History</Button>
			<Button
				size="sm"
				disabled={busy ||
					autosaving ||
					!!conflict ||
					snapshot?.status.kind === 'failure' ||
					(!hasUnpublishedChanges && !editor.modified)}
				onclick={() => control?.commit()}>Publish</Button
			>
		{/if}
		{#if onCloseSplit}
			<!--
				24px, not the row's 8px. Closing the split is a different kind of thing
				from the actions to its left — 8px says "same group", and it put an
				irreversible control one gap away from the one the user actually came
				to press.
			-->
			<div class="ms-4 flex shrink-0 items-center">
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
			</div>
		{/if}
	</header>

	<!-- A flex column: the editor sizes itself against this, and a block parent
	     collapsed it to its 384px floor with the rest of the pane left blank. -->
	<div inert={restoring} class="flex min-h-0 flex-1 flex-col px-4 pb-4 @[40rem]:px-8">
		{#if diagram.error && current}
			<p role="alert" class="text-sm text-destructive">
				The latest diagram could not be refreshed. Your current canvas is still available.
			</p>
		{/if}
		{#if diagram.error && !current}
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
				onretry={retry}
				onreview={(output) => coordinator?.capture(output.xml)}
				onmodifiedchange={(modified) => {
					if (modified) coordinator?.modified();
				}}
				oncontrol={(value) => (control = value)}
				onstatus={(value) => {
					editor = value;
					const status = coordinator?.snapshot.status;
					if (
						value.phase === 'failed' &&
						status?.kind === 'conflict' &&
						status !== capturedConflict
					) {
						capturedConflict = status;
						control?.review();
					}
				}}
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
		diagram={snapshot?.local ?? current}
		revisions={history.current?.revisions ?? []}
		loading={!history.current && !history.error}
		loadFailure={history.error
			? userFacingMessage(history.error, 'Version history could not be loaded.')
			: undefined}
		selectedFailure={selectedRevision?.error
			? userFacingMessage(selectedRevision.error, 'This version could not be loaded.')
			: undefined}
		selected={selectedRevision?.current?.revision}
		bind:selectedId={selectedRevisionId}
		onrestore={restore}
	/>
{/if}

{#if reviewConflict && snapshot}
	<DiagramConflictDialog
		bind:open={conflictOpen}
		base={reviewConflict.base}
		local={snapshot.local}
		remote={reviewConflict.remote}
		onUseRemote={useRemote}
		onKeepLocal={keepLocal}
	/>
{/if}
