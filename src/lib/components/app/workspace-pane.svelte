<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import { getNoteView } from '$lib/remote/notes.remote';
	import { noteSyncRegistry } from '$lib/stores/registries/note-sync-registry.svelte';
	import { editorSelectionRegistry } from '$lib/stores/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/registries/suggestion-tray-registry.svelte';
	import { noteTodosRegistry } from '$lib/stores/registries/note-todos-registry.svelte';
	import NoteWorkspace from './pages/note-workspace.svelte';

	let {
		noteId,
		shell,
		initialView
	}: {
		noteId: NoteId;
		shell: ShellContext;
		initialView?: NoteView;
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

	onMount(() => {
		if (view) return;
		let cancelled = false;
		void getNoteView(noteId)
			.then((loaded) => {
				if (cancelled) return;
				view = loaded as NoteView;
			})
			.catch((error) => {
				if (cancelled) return;
				loadingError = error instanceof Error ? error.message : 'Note could not be loaded.';
			});
		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		noteSyncRegistry.release(noteId);
		editorSelectionRegistry.release(noteId);
		suggestionTrayRegistry.release(noteId);
		noteTodosRegistry.release(noteId);
	});
</script>

<div class="flex w-full flex-1 flex-col" data-note-pane={noteId}>
	{#if view}
		<NoteWorkspace {view} {shell} {noteSync} {noteTodos} {suggestionTray} {editorSelection} />
	{:else if loadingError}
		<div class="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
			{loadingError}
		</div>
	{:else}
		<div class="flex min-h-[60vh] flex-1 flex-col gap-3 p-8" aria-label="Loading note">
			<div class="bg-muted h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-11/12 animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-4/5 animate-pulse rounded"></div>
			<div class="bg-muted mt-2 h-5 w-full animate-pulse rounded"></div>
			<div class="bg-muted h-5 w-5/6 animate-pulse rounded"></div>
		</div>
	{/if}
</div>
