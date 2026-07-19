<script lang="ts">
	import { untrack } from 'svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import WorkspacePane from './workspace-pane.svelte';

	let {
		shell,
		focusedInitialView
	}: {
		shell: ShellContext;
		/**
		 * Server-rendered NoteView for the focused tab on cold load.  Handed
		 * only to the matching pane so the first paint is hydrated from SSR
		 * instead of a client-side `getNoteView` round-trip.
		 */
		focusedInitialView?: NoteView;
	} = $props();

	// Background tabs are unmounted visually, but mounted in the DOM so the
	// TipTap editors, scroll positions, and pending input survive across
	// focus switches.  Only the focused pane is `display: block`.
	const focusedNoteId = $derived(workbench.focusedNoteId);
	const openTabs = $derived(workbench.openTabs);

	// Once a pane has consumed the focused initial view it owns that view;
	// subsequent focus switches into other panes don't re-claim it.  Captured
	// via `untrack` to signal that we only read the prop once at mount; the
	// parent layout passes a stable `NoteView`, or `undefined` after the
	// first pane is fully hydrated.
	let consumedFocusedInitial: NoteId | undefined = $state(
		untrack(() => (focusedInitialView ? focusedInitialView.note.id : undefined))
	);

	$effect(() => {
		// Drop the consumed marker if the focused initial view's note is no
		// longer in the open tabs (e.g. closed).
		if (consumedFocusedInitial && !openTabs.includes(consumedFocusedInitial)) {
			consumedFocusedInitial = undefined;
		}
	});
</script>

<div class="flex flex-1 flex-col min-h-0 min-w-0">
	{#each openTabs as noteId (noteId)}
		<div
			class="flex-1 min-h-0 min-w-0 pt-4 pb-4 md:pt-6 md:pb-6 {noteId === focusedNoteId
				? 'block'
				: 'hidden'}"
			aria-hidden={noteId !== focusedNoteId}
			inert={noteId !== focusedNoteId}
			data-pane={noteId}
		>
			<WorkspacePane
				{noteId}
				{shell}
				initialView={noteId === consumedFocusedInitial ? focusedInitialView : undefined}
			/>
		</div>
	{/each}
</div>
