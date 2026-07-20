<script lang="ts">
	import { untrack } from 'svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import WorkspacePane from './workspace-pane.svelte';
	import SplitDivider from './split-divider.svelte';

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

	// All open tabs mount exactly once as `WorkspacePane` siblings inside
	// the relative container below.  Toggling the split changes each
	// pane's CSS `left`/`right`/`display` but never its identity — the
	// TipTap editor, scroll position, and pending input survive across
	// split open/close and focus switches.  When the split is active:
	//
	//   - The focused pane is pinned to the left column, `right` edge at
	//     `splitRatio * 100%` so it leaves room for the right column.
	//   - The split pane is pinned to the right column, `left` edge at
	//     `(1 - splitRatio) * 100%`.
	//   - The `SplitDivider` sits between them at the same `left` edge.
	//   - Every other open tab is `hidden`.
	//
	// When no split is active the focused pane fills the container and all
	// other tabs are `hidden`.  The `{#each}` block is keyed by `noteId`,
	// so Svelte never re-creates a pane instance — only its wrapper's
	// classes/inline styles change.
	const focusedNoteId = $derived(workbench.focusedNoteId);
	const openTabs = $derived(workbench.openTabs);
	const splitNoteId = $derived(workbench.splitNoteId);
	const splitRatio = $derived(workbench.splitRatio);

	const splitActive = $derived(
		splitNoteId !== undefined &&
			splitNoteId !== focusedNoteId &&
			openTabs.includes(splitNoteId)
	);

	const primaryRightInset = $derived(splitActive ? `${splitRatio * 100}%` : '0');
	const splitLeftInset = $derived(splitActive ? `${(1 - splitRatio) * 100}%` : '0');

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

	// Drag-to-split: while the user is dragging a tab over the editor
	// area we render a translucent teal preview on the right half so the
	// drop target is visible before committing.  `dragCounter` tracks
	// enter/leave pairs so children firing `dragenter`/`dragleave` don't
	// prematurely hide the preview.
	let dragOverActive = $state(false);
	let dragCounter = 0;

	function onDragEnter(event: DragEvent) {
		event.preventDefault();
		dragCounter += 1;
		dragOverActive = true;
	}

	function onDragOver(event: DragEvent) {
		// Required for the drop event to fire afterwards.
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function onDragLeave(event: DragEvent) {
		event.preventDefault();
		dragCounter -= 1;
		if (dragCounter <= 0) {
			dragOverActive = false;
			dragCounter = 0;
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOverActive = false;
		dragCounter = 0;
		const id = event.dataTransfer?.getData('text/x-followthrough-note-id');
		if (id) void workbench.setSplit(id as NoteId);
	}
</script>

<svelte:window
	ondragend={() => {
		// Defensive: if the user drops off-target (drops outside the
		// editor area), the browser fires `dragend` on the source tab but
		// no `drop` here.  Reset the preview so we never leave it stuck.
		dragOverActive = false;
		dragCounter = 0;
	}}
/>

<div
	class="relative flex flex-1 min-h-0 min-w-0 flex-col"
	role="region"
	aria-label="Note editor area (drop a tab here to open it side-by-side)"
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{#each openTabs as noteId (noteId)}
		{@const isFocused = noteId === focusedNoteId}
		{@const isSplit = splitActive && noteId === splitNoteId}
		{@const visible = isFocused || isSplit}
		<div
			class="absolute inset-0 min-h-0 min-w-0 pt-4 pb-4 md:pt-6 md:pb-6 {visible
				? 'block'
				: 'hidden'}"
			style={isFocused
				? `right: ${primaryRightInset}; left: 0;`
				: isSplit
					? `left: ${splitLeftInset}; right: 0;`
					: 'left: 0; right: 0;'}
			aria-hidden={!visible}
			inert={!visible}
			data-pane={noteId}
			data-pane-role={isFocused ? 'primary' : isSplit ? 'split' : 'background'}
		>
			<WorkspacePane
				{noteId}
				{shell}
				initialView={noteId === consumedFocusedInitial ? focusedInitialView : undefined}
			/>
		</div>
	{/each}

	{#if splitActive}
		<!-- Divider sits on top of the panes at the split boundary. -->
		<div
			class="absolute top-0 bottom-0 z-10"
			style={`left: ${(1 - splitRatio) * 100}%;`}
			data-pane-role="divider"
		>
			<SplitDivider />
		</div>
	{/if}

	{#if dragOverActive && !splitActive}
		<!-- Translucent teal preview of where the dragged tab will land.
		     Pointer-events none so the drop still hits the container. -->
		<div
			class="pointer-events-none absolute inset-y-0 right-0 z-30 m-3 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/10 text-xs font-medium uppercase tracking-wide text-primary"
			style="width: calc(50% - 0.75rem);"
			aria-hidden="true"
		>
			Drop to open side-by-side
		</div>
	{/if}
</div>