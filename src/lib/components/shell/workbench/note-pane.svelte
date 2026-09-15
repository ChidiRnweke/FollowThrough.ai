<script lang="ts">
	import type { ShellContext } from '$lib/client/shell/views';

	import { onMount, onDestroy, untrack } from 'svelte';
	import { accessMessage } from '$lib/models/sync';
	import type { NoteId } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { editorSelectionRegistry } from '$lib/stores/notes/registries/editor-selection-registry.svelte';
	import NoteWorkspace from '../../notes/workspace/note-workspace.svelte';
	import { appContext } from '$lib/stores/agent/app-context.svelte';

	let {
		noteId,
		shell,
		inlineSuggestionsEnabled = true,
		onCloseSplit
	}: {
		noteId: NoteId;
		shell: ShellContext;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	// Acquire registry refs once for this pane's lifetime; `noteId` is stable
	// (the pane is keyed by it in `WorkspacePanes.svelte`).  Reads via
	// `untrack` silence Svelte 5's "initial-value capture" warning since the
	// props never change identity mid-life.
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before mounting an editor');
	const resources = session.resources;
	const note = untrack(() => resources.view({ type: 'notes', id: [noteId] }));
	const draft = untrack(() => resources.draft({ type: 'notes', id: [noteId] }));
	const editorSelection = untrack(() => editorSelectionRegistry.for(noteId));

	const projection = $derived(resources.views.note(noteId));
	// A server deletion removes the projection; the open document stays so its work can be kept.
	let view = $state(untrack(() => projection?.view));
	$effect.pre(() => {
		if (projection) view = projection.view;
	});
	// A cached note fades in with its layer. Only a note that replaces the skeleton needs its own fade.
	const replacesSkeleton = !untrack(() => view);
	let releaseContext: (() => void) | undefined;

	onMount(() => {
		releaseContext = appContext.registerPane(noteId, () => {
			const current = draft.value ?? view?.note;
			if (!current) return undefined;
			const dirty = ['pending', 'saving', 'conflict', 'error'].includes(draft.status);
			return {
				id: current.id,
				title: current.title,
				projectId: current.projectId,
				revision: current.currentRevision,
				syncStatus: draft.status,
				dirty,
				...(dirty ? { dirtyExcerpt: current.plainText.slice(0, 4000) } : {})
			};
		});
	});

	onDestroy(() => {
		releaseContext?.();
		editorSelectionRegistry.release(noteId);
	});
</script>

<div class="flex w-full min-w-0 flex-1 flex-col" data-note-pane={noteId}>
	{#if view}
		<div class={['flex min-w-0 flex-1 flex-col', replacesSkeleton && 'pane-reveal']}>
			{#if resources.state(note.identity)?.kind === 'deleted'}<p
					role="status"
					class="px-4 py-1 text-xs text-muted-foreground"
				>
					This note was deleted on the server. This document remains open so you can preserve your
					work.
				</p>{/if}
			{#if projection?.missing.length}<p
					role="status"
					class="px-4 py-1 text-xs text-muted-foreground"
				>
					Some related items are not available on this device yet.
				</p>{/if}
			<NoteWorkspace
				{view}
				{shell}
				{inlineSuggestionsEnabled}
				{draft}
				{editorSelection}
				{onCloseSplit}
			/>
		</div>
	{:else if note.state.kind === 'wait' || note.state.kind === 'ready'}
		<div class="flex min-h-96 flex-1 flex-col gap-3 p-8" aria-label="Loading note">
			<div class="bg-muted h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-11/12 animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-4/5 animate-pulse rounded"></div>
			<div class="bg-muted mt-2 h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-5/6 animate-pulse rounded"></div>
		</div>
	{:else}
		<div
			class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground"
		>
			<p>{accessMessage(note.state, 'note')}</p>
			<Button variant="outline" onclick={() => note.retry()}>Retry</Button>
		</div>
	{/if}
</div>
