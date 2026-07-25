<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { onMount } from 'svelte';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import CommandPalette from '$lib/components/app/command-palette.svelte';
	import RightPanel from '$lib/components/app/right-panel.svelte';
	import WorkspaceTabs from '$lib/components/app/workspace-tabs.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import type { NoteId, ProjectId } from '$lib/models';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { CommandKeyboardHandler } from '$lib/commands/keyboard';
	import { cn } from '$lib/utils';
	import { appContext } from '$lib/stores/app-context.svelte';
	import { Button } from '$lib/components/ui/button';
	import { palette } from '$lib/stores/palette.svelte';
	import { openChatSurface } from '$lib/navigation/responsive-surfaces';
	import { FtSearch as Search, FtChat as MessageSquare } from '$lib/components/icons';
	import MemoryNotificationMenu from '$lib/components/app/memory-notification-menu.svelte';

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
	const isNoteWorkbench = $derived(page.url.pathname.startsWith('/notes/'));
	const currentScreen = $derived.by(() => {
		if (page.url.pathname === '/') return 'Today';
		if (page.url.pathname.startsWith('/todos/')) return 'Todo';
		if (page.url.pathname.startsWith('/todos')) return 'Todos';
		if (page.url.pathname.startsWith('/chats')) return 'Chat';
		if (page.url.pathname.startsWith('/notes/')) {
			const noteId = page.url.pathname.split('/')[2];
			return data.shell.noteTree.find((note) => note.id === noteId)?.title ?? 'Note';
		}
		if (page.url.pathname.startsWith('/projects/')) {
			const projectId = page.url.pathname.split('/')[2];
			return data.shell.projects.find((project) => project.id === projectId)?.name ?? 'Project';
		}
		return page.url.pathname.split('/')[1]?.replaceAll('-', ' ') || 'FollowThrough';
	});

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
		appContext.configure(data.shell, page.url);
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
		class={cn(
			'relative min-h-0 min-w-0 border-l border-sidebar-border',
			isNoteWorkbench ? 'overflow-hidden' : 'overflow-y-auto'
		)}
		data-note-workbench={isNoteWorkbench ? '' : undefined}
	>
		<header
			class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2 md:hidden"
		>
			<Sidebar.Trigger class="size-11" />
			<p class="min-w-0 flex-1 truncate px-1 text-sm font-semibold capitalize">{currentScreen}</p>
			<Button
				variant="ghost"
				size="icon"
				class="size-11"
				aria-label="Search notes, todos and commands"
				onclick={() => palette.open()}
			>
				<Search />
			</Button>
			<MemoryNotificationMenu notifications={data.shell.pendingMemoryNotifications} />
			<Button
				variant="ghost"
				size="icon"
				class="size-11"
				aria-label="Open chat"
				onclick={(event) => openChatSurface(event.currentTarget)}
			>
				<MessageSquare />
			</Button>
		</header>
		{#if showProgressBar}
			<div
				data-navigation-progress
				aria-hidden="true"
				class="navigation-progress absolute inset-x-0 top-9 z-40 h-0.5 overflow-hidden"
			>
				<div class="motion-safe:animate-pulse bg-primary h-full w-full origin-left"></div>
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
	/>
</Sidebar.Provider>

<CommandPalette shell={data.shell} />
