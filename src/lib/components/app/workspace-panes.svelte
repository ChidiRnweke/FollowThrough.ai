<script lang="ts">
	import { untrack } from 'svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import X from '@lucide/svelte/icons/x';
	import WorkspacePane from './workspace-pane.svelte';
	import WorkspaceSplitResizer from './workspace-split-resizer.svelte';
	import { appContext } from '$lib/stores/app-context.svelte';

	let {
		shell,
		focusedInitialView
	}: {
		shell: ShellContext;
		focusedInitialView?: NoteView;
	} = $props();

	const focusedNoteId = $derived(workbench.focusedNoteId);
	const openTabs = $derived(workbench.openTabs);
	const splitNoteId = $derived(workbench.splitNoteId);
	const splitRatio = $derived(workbench.splitRatio);
	const splitActive = $derived(
		splitNoteId !== undefined && splitNoteId !== focusedNoteId && openTabs.includes(splitNoteId)
	);
	const primaryTitle = $derived(noteTitle(focusedNoteId));
	const secondaryTitle = $derived(noteTitle(splitNoteId));

	let root: HTMLElement | null = $state(null);
	let narrowPaneId = $state<NoteId | undefined>(untrack(() => focusedNoteId));
	let consumedFocusedInitial: NoteId | undefined = $state(
		untrack(() => (focusedInitialView ? focusedInitialView.note.id : undefined))
	);

	$effect(() => {
		root?.style.setProperty('--workspace-secondary-ratio', String(splitRatio));
		return () => root?.style.removeProperty('--workspace-secondary-ratio');
	});

	$effect(() => {
		if (consumedFocusedInitial && !openTabs.includes(consumedFocusedInitial)) {
			consumedFocusedInitial = undefined;
		}
		if (narrowPaneId !== focusedNoteId && narrowPaneId !== splitNoteId) {
			narrowPaneId = focusedNoteId;
		}
	});

	function noteTitle(noteId: NoteId | undefined): string {
		if (!noteId) return 'Note';
		return shell.noteTree.find((entry) => entry.id === noteId)?.title ?? 'Untitled';
	}

	function closeSplit(): void {
		narrowPaneId = focusedNoteId;
		void workbench.setSplit(undefined);
	}

	let dragOverActive = $state(false);
	let dragCounter = 0;

	function onDragEnter(event: DragEvent): void {
		event.preventDefault();
		dragCounter += 1;
		dragOverActive = true;
	}

	function onDragOver(event: DragEvent): void {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function onDragLeave(event: DragEvent): void {
		event.preventDefault();
		dragCounter -= 1;
		if (dragCounter <= 0) {
			dragOverActive = false;
			dragCounter = 0;
		}
	}

	function onDrop(event: DragEvent): void {
		event.preventDefault();
		dragOverActive = false;
		dragCounter = 0;
		const id = event.dataTransfer?.getData('text/x-followthrough-note-id');
		if (id) void workbench.setSplit(id as NoteId);
	}

	function markInteraction(noteId: NoteId): void {
		workbench.setInteractionFocus(noteId);
		appContext.recordFocus(noteId);
	}
</script>

<svelte:window
	ondragend={() => {
		dragOverActive = false;
		dragCounter = 0;
	}}
/>

<div
	bind:this={root}
	class="workspace-panes relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden"
	data-split-active={splitActive}
	role="region"
	aria-label="Note editor area (drop a tab here to open it side-by-side)"
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{#if splitActive && focusedNoteId && splitNoteId}
		<div class="workspace-narrow-switcher" data-testid="narrow-split-switcher">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				value={narrowPaneId}
				onValueChange={(value) => {
					if (value) {
						narrowPaneId = value as NoteId;
						markInteraction(value as NoteId);
					}
				}}
				aria-label="Visible split note"
				class="min-w-0 flex-1"
			>
				<ToggleGroup.Item value={focusedNoteId} class="min-w-0 flex-1">
					<span class="truncate">{primaryTitle}</span>
				</ToggleGroup.Item>
				<ToggleGroup.Item value={splitNoteId} class="min-w-0 flex-1">
					<span class="truncate">{secondaryTitle}</span>
				</ToggleGroup.Item>
			</ToggleGroup.Root>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Close split view"
				title="Close split view"
				onclick={closeSplit}
			>
				<X />
			</Button>
		</div>
	{/if}

	<div class="workspace-pane-stack">
		{#each openTabs as noteId (noteId)}
			{@const isFocused = noteId === focusedNoteId}
			{@const isSplit = splitActive && noteId === splitNoteId}
			{@const visible = isFocused || isSplit}
			<div
				class="workspace-pane-layer"
				aria-hidden={!visible}
				inert={!visible}
				data-pane={noteId}
				data-pane-role={isFocused ? 'primary' : isSplit ? 'split' : 'background'}
				data-narrow-active={visible && noteId === narrowPaneId}
				onfocusin={() => markInteraction(noteId)}
				onpointerdown={() => markInteraction(noteId)}
			>
				<ScrollArea orientation="both" class="h-full min-h-0 min-w-0">
					<div class="workspace-pane-scroll-content">
						<WorkspacePane
							{noteId}
							{shell}
							initialView={noteId === consumedFocusedInitial ? focusedInitialView : undefined}
							onCloseSplit={isSplit ? closeSplit : undefined}
						/>
					</div>
				</ScrollArea>
			</div>
		{/each}

		{#if splitActive}
			<div class="workspace-split-resizer" data-pane-role="divider">
				<WorkspaceSplitResizer
					initialSecondaryRatio={splitRatio}
					onRatioChange={(ratio) => workbench.setSplitRatio(ratio)}
				/>
			</div>
		{/if}
	</div>

	{#if dragOverActive && !splitActive}
		<div class="workspace-split-drop-preview" aria-hidden="true">Drop to open side-by-side</div>
	{/if}
</div>
