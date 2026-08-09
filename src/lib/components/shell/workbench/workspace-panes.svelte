<script lang="ts">
	import { untrack } from 'svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { chatKeyOf, isChatTab, isSearchTab, noteIdOf, type TabId } from '$lib/stores/workbench/tab-ref';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { NoteView } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { FtClose as X } from '$lib/components/icons';
	import WorkspacePane from './workspace-pane.svelte';
	import WorkspaceSplitResizer from './workspace-split-resizer.svelte';
	import { appContext } from '$lib/stores/agent/app-context.svelte';
	import { hasInternalTabDrag, readActiveTabDrag } from '$lib/client/workbench/tab-drag';

	let {
		shell,
		sessions,
		agentPreferences,
		agentModels,
		agentAvailable,
		focusedInitialView,
		inlineSuggestionsEnabled = true
	}: {
		shell: ShellContext;
		sessions: readonly Conversation[];
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentAvailable: boolean;
		focusedInitialView?: NoteView;
		inlineSuggestionsEnabled?: boolean;
	} = $props();

	const focusedNoteId = $derived(workbench.focusedTabId);
	const openTabs = $derived(workbench.openTabs);
	const splitNoteId = $derived(workbench.splitTabId);
	const splitRatio = $derived(workbench.splitRatio);
	const splitActive = $derived(workbench.splitActive);
	const primaryTitle = $derived(noteTitle(focusedNoteId));
	const secondaryTitle = $derived(noteTitle(splitNoteId));

	let root: HTMLElement | null = $state(null);
	let narrowPaneId = $state<TabId | undefined>(untrack(() => focusedNoteId));

	$effect(() => {
		root?.style.setProperty('--workspace-secondary-ratio', String(splitRatio));
		return () => root?.style.removeProperty('--workspace-secondary-ratio');
	});

	$effect(() => {
		if (narrowPaneId !== focusedNoteId && narrowPaneId !== splitNoteId) {
			narrowPaneId = focusedNoteId;
		}
	});

	function noteTitle(tabId: TabId | undefined): string {
		if (!tabId) return 'Note';
		if (isSearchTab(tabId)) return 'Search';
		const sessionKey = chatKeyOf(tabId);
		if (sessionKey !== undefined) {
			const conversationId = chatRegistry.peek(sessionKey)?.conversationId;
			return sessions.find((entry) => entry.id === conversationId)?.title ?? 'New chat';
		}
		const noteId = noteIdOf(tabId);
		return shell.noteTree.find((entry) => entry.id === noteId)?.title ?? 'Untitled';
	}

	function closeSplit(): void {
		narrowPaneId = focusedNoteId;
		void workbench.setSplit(undefined);
	}

	let dragOverActive = $state(false);
	let dragCounter = 0;

	function onDragEnter(event: DragEvent): void {
		if (!hasInternalTabDrag(event.dataTransfer)) return;
		event.preventDefault();
		dragCounter += 1;
		dragOverActive = true;
	}

	function onDragOver(event: DragEvent): void {
		if (!hasInternalTabDrag(event.dataTransfer)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
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
		if (!hasInternalTabDrag(event.dataTransfer)) return;
		event.preventDefault();
		dragOverActive = false;
		dragCounter = 0;
		const tabId = readActiveTabDrag(event.dataTransfer, shell.noteTree, openTabs);
		if (!tabId || tabId === focusedNoteId || tabId === splitNoteId) return;
		narrowPaneId = tabId;
		void workbench.setSplit(tabId);
	}

	function markInteraction(tabId: TabId): void {
		workbench.setInteractionFocus(tabId);
		// The agent's focus history is a history of notes; a chat pane taking focus
		// is not a note the agent should start reasoning about.
		const noteId = noteIdOf(tabId);
		if (noteId) appContext.recordFocus(noteId);
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
						narrowPaneId = value;
						markInteraction(value);
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
			<Tip text="Close split view">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label="Close split view"
						onclick={closeSplit}
					>
						<X />
					</Button>
				{/snippet}
			</Tip>
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
				<!--
					A note pane scrolls as a document, so the pane owns the scrollport.
					A chat pane scrolls its own transcript and pins its composer, so it
					takes the pane's full height instead — the sanctioned "independently
					scrolling pane" case in DESIGN_SYSTEM's responsive contract. Wrapping
					it in the document scroller collapsed it to content height and left
					the composer floating mid-pane.
				-->
				{#snippet pane()}
					<WorkspacePane
						tabId={noteId}
						{shell}
						{sessions}
						{agentPreferences}
						{agentModels}
						{agentAvailable}
						{inlineSuggestionsEnabled}
						initialView={noteId === focusedInitialView?.note.id ? focusedInitialView : undefined}
						onCloseSplit={isSplit ? closeSplit : undefined}
					/>
				{/snippet}
				{#if isChatTab(noteId)}
					<div class="workspace-pane-scroll-content flex h-full min-h-0 flex-col">
						{@render pane()}
					</div>
				{:else}
					<ScrollArea orientation="both" class="h-full min-h-0 min-w-0">
						<div class="workspace-pane-scroll-content">
							{@render pane()}
						</div>
					</ScrollArea>
				{/if}
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

	{#if dragOverActive}
		<div class="workspace-split-drop-preview" aria-hidden="true">
			{splitActive ? 'Drop to replace side-by-side note' : 'Drop to open side-by-side'}
		</div>
	{/if}
</div>
