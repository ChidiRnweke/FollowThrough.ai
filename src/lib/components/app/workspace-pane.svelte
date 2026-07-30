<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import { getNoteView } from '$lib/remote/notes.remote';
	import { noteSyncRegistry } from '$lib/stores/registries/note-sync-registry.svelte';
	import { editorSelectionRegistry } from '$lib/stores/registries/editor-selection-registry.svelte';
	import { suggestionTrayRegistry } from '$lib/stores/registries/suggestion-tray-registry.svelte';
	import { noteTodosRegistry } from '$lib/stores/registries/note-todos-registry.svelte';
	import NoteWorkspace from './pages/note-workspace.svelte';
	import { appContext } from '$lib/stores/app-context.svelte';

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
	let requestedVersion = $state('');

	function isNewer(candidate: NoteView, current: NoteView | undefined): boolean {
		return (
			!current ||
			candidate.note.currentRevision > current.note.currentRevision ||
			candidate.note.updatedAt > current.note.updatedAt
		);
	}

	async function refreshView(version: string): Promise<void> {
		if (requestedVersion === version) return;
		requestedVersion = version;
		try {
			const loaded = (await getNoteView(noteId)) as NoteView;
			if (isNewer(loaded, view)) view = loaded;
			loadingError = undefined;
		} catch (error) {
			loadingError = error instanceof Error ? error.message : 'Note could not be loaded.';
		}
	}

	$effect(() => {
		const incoming = initialView;
		if (
			incoming?.note.id === noteId &&
			isNewer(
				incoming,
				untrack(() => view)
			)
		)
			view = incoming;
	});

	$effect(() => {
		const summary = shell.noteTree.find((entry) => entry.id === noteId);
		if (!summary) return;
		const current = untrack(() => view);
		if (
			!current ||
			summary.currentRevision > current.note.currentRevision ||
			summary.updatedAt > current.note.updatedAt
		)
			void refreshView(`${summary.currentRevision}:${summary.updatedAt}`);
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
		if (!view) void refreshView('initial');
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
		<div class="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
			{loadingError}
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
