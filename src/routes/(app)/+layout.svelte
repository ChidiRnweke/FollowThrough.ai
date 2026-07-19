<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { onMount } from 'svelte';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import CommandPalette from '$lib/components/app/command-palette.svelte';
	import RightPanel from '$lib/components/app/right-panel.svelte';
	import WorkspaceTabs from '$lib/components/app/workspace-tabs.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import type { NoteId, ProjectId } from '$lib/models';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { CommandKeyboardHandler } from '$lib/commands/keyboard';

	let { data, children } = $props();

	const isNavigating = $derived(navigating.to !== null);
	// Suppress the thin progress bar during workbench-internal navigations
	// (tab focus / open / close / reorder) — those are local state changes,
	// not page loads, and the bar would strobe across the sticky tabs.
	const isWorkbenchInternal = $derived(
		Boolean(
			navigating.to &&
			navigating.from &&
			navigating.from.url.pathname.startsWith('/notes/') &&
			navigating.to.url.pathname.startsWith('/notes/')
		)
	);
	const showProgressBar = $derived(isNavigating && !isWorkbenchInternal);

	let insetRef = $state<HTMLElement | null>(null);

	afterNavigate(() => {
		if (insetRef) insetRef.scrollTop = 0;
	});

	// Pre-compute the noteId → projectId map once per shell reload so the
	// workbench can resolve the focused tab's project without re-scanning.
	const shellProjectOf = $derived.by(
		() => (noteId: NoteId) =>
			data.shell.noteTree.find((entry) => entry.id === noteId)?.projectId as ProjectId | undefined
	);

	onMount(() => {
		void workbench.hydrate(shellProjectOf);
	});

	// The URL is canonical for the workbench.  Synchronise store ↔ URL after
	// every navigation so the tab strip stays current with browser Back /
	// Forward and so the active-project derivation recomputes cleanly.
	$effect(() => {
		void page.url;
		workbench.syncFromUrl();
		workbench.refreshActiveProjectId(shellProjectOf);
		void pruneClosedTabs();
	});

	// Drop tabs whose notes have been archived or deleted since the last sync.
	async function pruneClosedTabs(): Promise<void> {
		const known = new Set<NoteId>(
			data.shell.noteTree
				.filter((entry) => entry.kind === 'note' && !entry.archivedAt)
				.map((entry) => entry.id)
		);
		await workbench.pruneClosedNotes(known);
	}

	const activeNoteId = $derived(workbench.focusedNoteId ?? urlActiveNoteId());
	const activeProjectId = $derived(workbench.activeProjectId ?? urlActiveProjectId());

	function urlActiveNoteId(): NoteId | undefined {
		if (!page.url.pathname.startsWith('/notes/')) return undefined;
		return page.url.pathname.split('/')[2] as NoteId | undefined;
	}
	function urlActiveProjectId(): ProjectId | undefined {
		const noteId = urlActiveNoteId();
		if (!noteId) {
			if (page.url.pathname.startsWith('/projects/'))
				return page.url.pathname.split('/')[2] as ProjectId | undefined;
			return undefined;
		}
		return data.shell.noteTree.find((entry) => entry.id === noteId)?.projectId as
			ProjectId | undefined;
	}

	const keyboard = new CommandKeyboardHandler();
	function onkeydown(event: KeyboardEvent): void {
		keyboard.handle(event);
	}

	async function createNoteFromStrip(): Promise<void> {
		const output = await projectActions.createNote('Untitled');
		if (output) await workbench.openTab(output.note.id);
	}
</script>

<svelte:window {onkeydown} />

<Sidebar.Provider open={data.sidebarOpen} class="h-dvh min-h-0 overflow-hidden">
	<AppSidebar
		shell={data.shell}
		activePath={page.url.pathname}
		{activeNoteId}
		loading={isNavigating}
	/>
	<Sidebar.Inset
		bind:ref={insetRef}
		class="relative min-w-0 overflow-y-auto border-l border-sidebar-border"
	>
		{#if showProgressBar}
			<div class="absolute inset-x-0 top-9 z-40 h-0.5 overflow-hidden">
				<div class="bg-primary h-full w-full origin-left animate-pulse"></div>
			</div>
		{/if}
		<WorkspaceTabs
			shell={data.shell}
			hidden={workbench.stripHidden}
			oncreateNote={() => void createNoteFromStrip()}
			ontoggleHidden={() => workbench.toggleStripHidden()}
		/>
		{@render children()}
	</Sidebar.Inset>
	<RightPanel
		shell={data.shell}
		sessions={data.sessions}
		agentPreferences={data.agentPreferences}
		agentModels={data.agentModels}
		agentAvailable={data.agentAvailable}
		{activeNoteId}
		{activeProjectId}
		onstatus={(todoId, status) => void todoUpdates.setStatus(todoId, status)}
	/>
</Sidebar.Provider>

<CommandPalette shell={data.shell} />
