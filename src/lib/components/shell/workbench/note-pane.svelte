<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import type { NoteId, NoteView } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { noteSyncRegistry } from '$lib/stores/notes/registries/note-sync-registry.svelte';
	import { editorSelectionRegistry } from '$lib/stores/notes/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/notes/registries/suggestion-tray-registry.svelte';
	import { noteTodosRegistry } from '$lib/stores/notes/registries/note-todos-registry.svelte';
	import NoteWorkspace from '../../notes/workspace/note-workspace.svelte';
	import { appContext } from '$lib/stores/agent/app-context.svelte';

	let {
		noteId,
		shell,
		initialView,
		inlineSuggestionsEnabled = true,
		onCloseSplit
	}: {
		noteId: NoteId;
		shell: ShellContext;
		initialView?: NoteView;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	// Acquire registry refs once for this pane's lifetime; `noteId` is stable
	// (the pane is keyed by it in `WorkspacePanes.svelte`).  Reads via
	// `untrack` silence Svelte 5's "initial-value capture" warning since the
	// props never change identity mid-life.
	const noteSync = untrack(() => noteSyncRegistry.for(noteId));
	const editorSelection = untrack(() => editorSelectionRegistry.for(noteId));
	const suggestionTray = untrack(() => suggestionTrayRegistry.for(noteId));
	const noteTodos = untrack(() => noteTodosRegistry.for(noteId));

	let view = $state<NoteView | undefined>(untrack(() => initialView));
	let loadingError = $state<string | undefined>(undefined);
	let releaseContext: (() => void) | undefined;

	let opened = $state(false);
	const projection = $derived(workspaceSession.current?.resources.views.note(noteId));
	const serverDeleted = $derived(
		workspaceSession.current?.resources.state({ type: 'notes', id: [noteId] })?.kind === 'deleted'
	);
	async function refreshView(): Promise<void> {
		try {
			const session = await workspaceSession.start();
			const loaded = await session.resources.openNote(noteId);
			if (loaded.kind === 'ready') {
				view = loaded.value;
				opened = true;
				loadingError = undefined;
			} else
				loadingError =
					loaded.kind === 'failure'
						? loaded.message
						: loaded.kind === 'deleted'
							? 'This note was deleted.'
							: 'This note is not available on this device. Reconnect to download it.';
			// audit-allow: silent-catch — the pane renders startup or storage failures as its load error.
		} catch (error) {
			loadingError = error instanceof Error ? error.message : 'Note could not be loaded.';
		}
	}
	$effect(() => {
		if (!opened) return;
		if (projection) view = projection.view;
	});

	onMount(() => {
		releaseContext = appContext.registerPane(noteId, () => {
			const note = noteSync.record?.local ?? view?.note;
			if (!note) return undefined;
			const dirty =
				noteSync.record?.state === 'pending' ||
				noteSync.record?.state === 'syncing' ||
				noteSync.record?.state === 'conflict';
			return {
				id: note.id,
				title: note.title,
				projectId: note.projectId,
				revision: note.currentRevision,
				syncStatus: noteSync.status,
				dirty,
				...(dirty ? { dirtyExcerpt: note.plainText.slice(0, 4000) } : {})
			};
		});
		void refreshView();
	});

	onDestroy(() => {
		releaseContext?.();
		noteSyncRegistry.release(noteId);
		editorSelectionRegistry.release(noteId);
		suggestionTrayRegistry.release(noteId);
		noteTodosRegistry.release(noteId);
	});
</script>

<div class="flex w-full min-w-0 flex-1 flex-col" data-note-pane={noteId}>
	{#if view}
		{#if serverDeleted}<p role="status" class="px-4 py-1 text-xs text-muted-foreground">
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
			{noteSync}
			{noteTodos}
			{suggestionTray}
			{editorSelection}
			{onCloseSplit}
		/>
	{:else if loadingError}
		<div
			class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground"
		>
			<p>{loadingError}</p>
			<Button variant="outline" onclick={refreshView}>Retry</Button>
		</div>
	{:else}
		<div class="flex min-h-96 flex-1 flex-col gap-3 p-8" aria-label="Loading note">
			<div class="bg-muted h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-11/12 animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-4/5 animate-pulse rounded"></div>
			<div class="bg-muted mt-2 h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-5/6 animate-pulse rounded"></div>
		</div>
	{/if}
</div>
