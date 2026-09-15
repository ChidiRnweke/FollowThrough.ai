<script lang="ts">
	import { EditorSession } from '$lib/stores/workspace/editor-session.svelte';
	import { onMount, untrack } from 'svelte';
	import { diagramEtag } from '$lib/models/diagrams';
	import { accessMessage } from '$lib/models/sync';
	import type {
		DiagramId,
		DiagramRevisionId,
		DiagramRevisionSummary,
		DrawioDiagram
	} from '$lib/models/diagrams';
	import type { DiagramMutationRequest } from '$lib/models/workspace-mutations';
	import { workspaceResourceKey } from '$lib/models/workspace-sync';

	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtClose as X } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { userFacingMessage } from '$lib/errors';
	import {
		listDiagramRevisions,
		getDiagramRevision,
		restoreDiagramRevision
	} from '$lib/remote/diagrams/diagrams.remote';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from '../drawio-embed.svelte';
	import DiagramPreview from '../diagram-preview.svelte';
	import DiagramStatus from './diagram-status.svelte';
	import DiagramTitle from './diagram-title.svelte';
	import DiagramVersionHistory from './diagram-version-history.svelte';
	import DiagramConflictDialog from './diagram-conflict-dialog.svelte';

	let { diagramId, onCloseSplit }: { diagramId: DiagramId; onCloseSplit?: () => void } = $props();
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before opening a diagram');
	const resources = session.resources;
	const draft = untrack(() => resources.draft({ type: 'diagrams', id: [diagramId] }));
	void draft.open();
	const editorSession = new EditorSession(() => resources.active);
	let control = $state<DrawioControl>();
	let editor = $state<DrawioStatus>({ phase: 'loading', modified: false });
	let renaming = $state(false);
	let renameDraft = $state<WorkspaceDraft<'diagrams'> | null>(null);
	let restoring = $state(false);
	let historyOpen = $state(false);
	let conflictOpen = $state(false);
	let reviewSource = $state<string | null>(null);
	let selectedRevisionId = $state<DiagramRevisionId>();
	const current = $derived(
		draft.state.kind === 'ready' ? (resources.views.diagram(diagramId) ?? draft.state.value) : null
	);
	const local = $derived(draft.value);
	const title = $derived(current?.title ?? 'Untitled diagram');
	let history = $state<
		| { kind: 'loading' }
		| { kind: 'ready'; revisions: readonly DiagramRevisionSummary[] }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	const selectedRevision = $derived(
		selectedRevisionId && resources.online
			? getDiagramRevision({ diagramId, revisionId: selectedRevisionId })
			: undefined
	);
	const conflict = $derived(draft.conflict);
	const reviewConflict = $derived(
		conflict
			? {
					...conflict,
					local:
						conflict.local && reviewSource !== null
							? { ...conflict.local, source: reviewSource }
							: conflict.local
				}
			: undefined
	);
	const conflictId = $derived(
		resources.pending.find(
			(entry) =>
				entry.intent.key === workspaceResourceKey({ type: 'diagrams', id: [diagramId] }) &&
				entry.delivery.kind === 'conflict'
		)?.intent.operationId
	);
	const autosaving = $derived(draft.status === 'saving');
	const busy = $derived(editor.phase === 'exporting' || editor.phase === 'saving' || restoring);
	const hasUnpublishedChanges = $derived(
		current?.kind === 'drawio' && current.currentRevision > current.publishedRevision
	);

	onMount(() => () => editorSession.close());

	$effect(() => {
		if (conflictId) {
			conflictOpen = true;
			untrack(() => control?.review());
		}
	});

	// A clean canvas can adopt a downloaded version synchronously. Dirty canvases keep their observed base.
	$effect(() => {
		const incoming = draft.newer;
		if (!incoming || incoming.kind !== 'drawio' || !control || editor.modified || busy || renaming)
			return;
		untrack(() => {
			const changedSource = draft.value?.source.trim() !== incoming.source.trim();
			draft.adopt();
			if (changedSource) control?.replace(incoming.source);
			editorSession.accept();
		});
	});

	const historyVersion = $derived(resources.snapshot({ type: 'diagrams', id: [diagramId] })?.etag);
	$effect(() => {
		// Historical bodies are on demand; the mutable index is a fresh request on each opening/version.
		const version = historyVersion;
		if (!historyOpen) return;
		if (!resources.online) {
			history = { kind: 'failure', message: 'Connect to load version history.' };
			return;
		}
		void version;
		let cancelled = false;
		history = { kind: 'loading' };
		void listDiagramRevisions(diagramId)
			.then(({ revisions }) => {
				if (!cancelled) history = { kind: 'ready', revisions };
			})
			.catch((error) => {
				const failure = {
					kind: 'failure' as const,
					message: userFacingMessage(error, 'Version history could not be loaded.')
				};
				if (!cancelled) history = failure;
				return { kind: 'failure', message: failure.message };
			});
		return () => {
			cancelled = true;
		};
	});

	function editable(): DrawioDiagram {
		const value = draft.value;
		if (!value || value.kind !== 'drawio')
			throw new Error('This diagram is not available for editing');
		return value;
	}
	async function stage(command: DiagramMutationRequest['command']): Promise<void> {
		const result = await draft.stage(command);
		if (result.kind === 'failure') throw new Error(result.message);
		reviewSource = null;
	}
	async function rename(title: string): Promise<void> {
		renaming = true;
		try {
			if (!renameDraft?.value) throw new Error('Open the title before changing it');
			const result = await renameDraft.stage({ kind: 'renameDiagram', diagramId, title });
			if (result.kind === 'failure') throw new Error(result.message);
			renameDraft = null;
		} finally {
			renaming = false;
		}
	}
	async function autosave(source: string): Promise<void> {
		await stage({ kind: 'saveDiagram', diagramId, source });
	}
	async function publish(output: DrawioExport): Promise<void> {
		await stage({ kind: 'publishDiagram', diagramId, source: output.xml, renderedSvg: output.svg });
		toast.success('Publication saved on this device');
	}

	async function retry(): Promise<void> {
		await draft.retry();
		if (draft.status === 'error' || draft.status === 'conflict')
			throw new Error(draft.lastError ?? 'Review the conflicting diagram before retrying');
	}
	async function retryFromHeader(): Promise<void | { kind: 'failure' }> {
		if (editor.phase === 'failed') {
			control?.retry();
			return;
		}
		try {
			await retry();
		} catch (error) {
			toast.error(userFacingMessage(error, 'The diagram could not be saved.'));
			return { kind: 'failure' };
		}
	}
	async function restore(revisionId: DiagramRevisionId): Promise<void> {
		const revision = selectedRevision?.current?.revision;
		if (!revision || revision.id !== revisionId)
			throw new Error('Load the selected version before restoring it');
		restoring = true;
		try {
			const value = editable();
			if (!resources.online || draft.status !== 'synced' || editor.modified)
				throw new Error('Save the diagram and connect before restoring a version');
			const isCurrent = editorSession.checkpoint();
			const result = await restoreDiagramRevision({
				diagramId,
				revisionId,
				baseEtag: diagramEtag(value)
			});
			if (result.outcome !== 'saved')
				throw new Error('The diagram changed. Review it before restoring a version');
			await resources.synchronize();
			const opened = await draft.read(() => isCurrent() && !editor.modified);
			if (opened.kind === 'ready') control?.replace(opened.value.source);
			else if (opened.kind === 'superseded')
				toast.info('Your later edits are retained for review.');
			else throw new Error('The restored diagram could not be opened');
			historyOpen = false;
		} finally {
			restoring = false;
		}
	}
	async function useRemote(): Promise<void> {
		const isCurrent = editorSession.checkpoint();
		const result = await draft.discard(isCurrent);
		if (result.kind === 'superseded') return;
		if (result.kind === 'ready') control?.replace(result.value.source);
		else if (result.kind !== 'deleted') throw new Error('The server copy could not be opened');
		conflictOpen = false;
		reviewSource = null;
	}
	async function keepLocal(): Promise<void> {
		if (editor.phase === 'exporting' || (editor.modified && reviewSource === null))
			throw new Error('Wait for the current canvas preview before keeping these changes');
		if (reviewSource !== null && reviewSource !== editable().source) await autosave(reviewSource);
		await draft.keep();
		if (draft.status === 'conflict' || draft.status === 'error')
			throw new Error(draft.lastError ?? 'The diagram changed again; review the new conflict');
		conflictOpen = false;
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
		<DiagramTitle
			{title}
			busy={!current || renaming || restoring || !!conflict}
			onstart={() => {
				renameDraft = resources.draft({ type: 'diagrams', id: [diagramId] });
				renameDraft.capture();
			}}
			oncommit={rename}
		/>
		{#if conflict}
			<Button variant="outline" size="sm" onclick={() => (conflictOpen = true)}
				>Review conflict</Button
			>
		{:else if draft.status === 'error'}
			<DiagramStatus
				status={{
					phase: 'failed',
					modified: true,
					failure: draft.lastError ?? 'The diagram could not be saved'
				}}
				onretry={() => void retryFromHeader()}
			/>
		{:else}
			<DiagramStatus status={editor} onretry={() => control?.retry()}>
				{#snippet idle()}{#if draft.status === 'pending'}<p
							class="text-xs text-muted-foreground"
							role="status"
						>
							Saved on this device
						</p>{/if}{/snippet}
			</DiagramStatus>
		{/if}
		{#if current?.kind === 'drawio'}
			<Button variant="ghost" size="sm" disabled={busy || !resources.online} onclick={openHistory}
				>History</Button
			>
			<Button
				size="sm"
				disabled={busy || autosaving || !!conflict || (!hasUnpublishedChanges && !editor.modified)}
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
		{#if resources.readStatus.kind === 'failure' && current}
			<p role="alert" class="text-sm text-destructive">
				The latest diagram could not be refreshed. Your current canvas is still available.
			</p>
		{/if}
		{#if draft.state.kind !== 'ready' && draft.state.kind !== 'wait'}
			<p class="text-sm text-muted-foreground">{accessMessage(draft.state, 'diagram')}</p>
			<Button variant="outline" onclick={() => void draft.open()}>Retry</Button>
		{:else if !current}
			<p class="text-sm text-muted-foreground">Loading the diagram.</p>
		{:else if current.kind === 'drawio'}
			<DrawioEmbed
				xml={current.source}
				{title}
				oncommit={publish}
				onautosave={autosave}
				onreview={(output) => (reviewSource = output.xml)}
				onmodifiedchange={(modified) => {
					if (modified) {
						editorSession.changed();
						reviewSource = null;
					}
				}}
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
		diagram={local?.kind === 'drawio'
			? { ...local, source: reviewSource ?? local.source }
			: current}
		revisions={history.kind === 'ready' ? history.revisions : []}
		loading={history.kind === 'loading'}
		loadFailure={history.kind === 'failure' ? history.message : undefined}
		selectedFailure={selectedRevision?.error
			? userFacingMessage(selectedRevision.error, 'This version could not be loaded.')
			: undefined}
		selected={selectedRevision?.current?.revision}
		bind:selectedId={selectedRevisionId}
		onrestore={restore}
	/>
{/if}

{#if reviewConflict}
	<DiagramConflictDialog
		bind:open={conflictOpen}
		record={reviewConflict}
		onUseRemote={useRemote}
		onKeepLocal={keepLocal}
	/>
{/if}
