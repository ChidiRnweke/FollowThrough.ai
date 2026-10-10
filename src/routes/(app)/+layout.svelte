<script lang="ts">
	import { newNoteDestination } from '$lib/client/shell/new-note-destination';
	import { WorkspaceStartup, WorkspaceRouteOutlet } from '$lib/components/shell';
	import type { RouteReadiness } from '$lib/client/sync/route-access';
	import type { NoteId } from '$lib/models/notes';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { AppSidebar, CommandPalette, RightPanel, WorkspaceTabs } from '$lib/components/shell';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { parseTabId, noteIdOf, openResourceOf, type TabId } from '$lib/stores/workbench/tab-ref';
	import type { ProjectId } from '$lib/models/projects';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { IndexedDbWorkbenchLayout } from '$lib/client/workbench/indexeddb-layout';
	import { proofreading } from '$lib/stores/notes/proofreading.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import { CommandKeyboardHandler } from '$lib/commands/keyboard';
	import { cn } from '$lib/utils';
	import { appContext } from '$lib/stores/agent/app-context.svelte';
	import { effectiveSidebarWidth } from '$lib/services/workspace/sidebar-width';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import { IsDockedPanel } from '$lib/hooks/is-docked-panel.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { palette } from '$lib/stores/shell/palette.svelte';
	import { openChatSurface } from '$lib/client/shell/responsive-surfaces';
	import * as Icon from '$lib/components/icons';
	import { SyncStatusMenu } from '$lib/components/shell';
	import { MemoryNotificationMenu } from '$lib/components/memory';

	let { data, children } = $props();
	const shell = $derived(
		workspaceSession.current === data.session
			? data.session.resources.views.shell(data.session.bootstrap.accountId)
			: null
	);

	const inventoryLoading = $derived(data.session.resources.availability !== 'complete');
	const prerequisitesReady = $derived(data.session.resources.startupReadiness.kind === 'ready');
	// Workbench detail panes already have record-level loading states. Collection
	// screens must not turn a partial inventory into empty results or exact counts.
	const recordRoute = $derived(
		/^\/(notes|diagrams|skills|todos|widgets)\/[^/]+$/.test(page.url.pathname)
	);
	const contentReady = $derived(
		shell !== null && prerequisitesReady && (!inventoryLoading || recordRoute)
	);
	const settledRoute: Promise<RouteReadiness> = Promise.resolve({ kind: 'ready' });
	const routeReady = $derived(page.data.routeReady ?? settledRoute);

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
	// The pane host owns its own scrolling wherever it renders, which since chat
	// became a tab kind includes `/chats/*` carrying a `?focus=chat:` tab.
	const hostsWorkbenchPanes = $derived(isNoteWorkbench || workbench.isWorkbenchPath);
	const currentScreen = $derived.by(() => {
		if (page.url.pathname === '/today') return 'Today';
		if (page.url.pathname.startsWith('/todos/')) return 'Todo';
		if (page.url.pathname.startsWith('/todos')) return 'Todos';
		if (page.url.pathname.startsWith('/chats')) return 'Chat';
		if (page.url.pathname.startsWith('/search')) return 'Search';
		if (page.url.pathname.startsWith('/notes/')) {
			const noteId = page.url.pathname.split('/')[2];
			return shell?.noteTree.find((note) => note.id === noteId)?.title ?? 'Note';
		}
		if (page.url.pathname.startsWith('/projects/')) {
			const projectId = page.url.pathname.split('/')[2];
			return shell?.projects.find((project) => project.id === projectId)?.name ?? 'Project';
		}
		return page.url.pathname.split('/')[1]?.replaceAll('-', ' ') || 'FollowThrough';
	});

	let insetRef = $state<HTMLElement | null>(null);

	afterNavigate(() => {
		void workspaceSession.synchronize();
		if (insetRef) insetRef.scrollTop = 0;
	});

	// Pre-compute the noteId → projectId map once per shell reload so the
	// workbench can resolve the focused tab's project without re-scanning.
	const projectOfTab = $derived.by(() => (tabId: TabId): ProjectId | undefined => {
		const ref = parseTabId(tabId);
		if (ref?.kind === 'diagram')
			return data.session.resources.views.diagram(ref.diagramId)?.projectId;
		if (ref?.kind === 'widget') return data.session.resources.views.widget(ref.widgetId)?.projectId;
		return shell?.noteTree.find((entry) => entry.id === noteIdOf(tabId))?.projectId;
	});

	const workbenchAccountId = $derived(data.session.bootstrap.accountId);
	$effect(() => {
		const accountId = workbenchAccountId;
		return untrack(() => {
			const layout = new IndexedDbWorkbenchLayout(accountId);
			const detachWorkbench = workbench.attach(layout);
			void workbench.hydrate(projectOfTab);
			return () => {
				detachWorkbench();
				layout.close();
			};
		});
	});

	onMount(() => {
		// Injected rather than imported by the store: the agent stores reach back
		// into the workbench through the app context, so importing them there would
		// close an initialisation loop.
		workbench.conversationOf = (sessionKey) => chatRegistry.peek(sessionKey)?.conversationId;
		// Read here rather than in the note editor so the answer is already known
		// when a note pane mounts; a pane that started before it would spend its
		// first seconds underlining words the reader had already dismissed. This
		// only reads preferences — the checker itself is fetched by the first note
		// that opens, never on the way to Today or a todo board.
		proofreading.hydrate();
		return () => workspaceSession.stop();
	});

	// The URL is canonical for the workbench.  Synchronise store ↔ URL after
	// every navigation so the tab strip stays current with browser Back /
	// Forward and so the active-project derivation recomputes cleanly.
	$effect(() => {
		void page.url;
		if (!shell) return;
		appContext.configure(shell, page.url);
		workbench.syncFromUrl();
		workbench.refreshActiveProjectId(projectOfTab);
		void pruneClosedTabs();
	});

	// Drop tabs whose notes have been archived or deleted since the last sync.
	// Every live tree entry counts as known, not just `kind === 'note'`: a tab on
	// a folder would otherwise never be prunable-and-done, so each pass would
	// prune it again and fire another navigation.
	async function pruneClosedTabs(): Promise<void> {
		if (!shell || data.session.resources.availability !== 'complete') return;
		const known = new Set<NoteId>(
			shell.noteTree.filter((entry) => !entry.archivedAt).map((entry) => entry.id)
		);
		await workbench.pruneClosedNotes(known);
	}

	const activeNoteId = $derived(workbench.focusedNoteId ?? urlActiveNoteId());
	const openResource = $derived(openResourceOf(workbench.focusedTabId));
	const activeProjectId = $derived(workbench.activeProjectId ?? urlActiveProjectId());
	// The sidebar tree highlight tracks where the user *is*: off note routes the
	// stale focused tab must not light up a note (RightPanel keeps the real
	// activeNoteId so chat note-context survives navigating away).
	const highlightedNoteId = $derived(isNoteWorkbench ? activeNoteId : undefined);

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
		return shell?.noteTree.find((entry) => entry.id === noteId)?.projectId as ProjectId | undefined;
	}

	// The sidebar's width is the user's preference minus whatever else needs the row.
	// This layout is the only place that can see all three columns at once, so it owns
	// the budget: the preference persists untouched via cookie and is handed back in
	// full the moment the chat panel closes or the split ends.
	let innerWidth = $state(0);
	// Seeded from the cookie once; after that the client owns the preference, the
	// same one-way handoff `open={data.sidebarOpen}` already makes.
	let preferredSidebarWidth = $state(untrack(() => data.sidebarWidth));
	const dockedPanel = new IsDockedPanel();
	const sidebarWidth = $derived(
		effectiveSidebarWidth(preferredSidebarWidth, {
			viewportWidth: innerWidth,
			panelDocked: rightPanel.mode !== 'closed' && dockedPanel.current,
			splitActive: workbench.splitActive
		})
	);

	const keyboard = new CommandKeyboardHandler();
	function onkeydown(event: KeyboardEvent): void {
		if (prerequisitesReady && !inventoryLoading) keyboard.handle(event);
	}

	const inboxProjectId = $derived(shell?.projects.find((project) => project.role === 'inbox')?.id);

	async function createNoteFromStrip(): Promise<void> {
		const projectId = newNoteDestination({
			routeProject: urlActiveProjectId(),
			focusedProject: workbench.activeProjectId,
			onNoteRoute: isNoteWorkbench,
			inbox: inboxProjectId
		});
		if (!projectId) {
			toast.error('This workspace has no inbox yet. Open Today to create your first note.');
			return;
		}
		const output = await projectActions.createNote('Untitled', projectId);
		if (output) await workbench.openTab(output.note.id);
	}
</script>

<svelte:window {onkeydown} bind:innerWidth />

<Sidebar.Provider
	open={data.sidebarOpen}
	width={sidebarWidth}
	onWidthChange={(width) => (preferredSidebarWidth = width)}
	class="h-dvh min-h-0 overflow-hidden dark:has-data-[variant=inset]:bg-background"
>
	<AppSidebar
		{shell}
		{inventoryLoading}
		activePath={page.url.pathname}
		activeNoteId={highlightedNoteId}
		loading={isNavigating}
		squeezed={sidebarWidth < preferredSidebarWidth}
	/>
	<Sidebar.Inset
		bind:ref={insetRef}
		class={cn(
			'relative min-h-0 min-w-0 dark:bg-card md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:ring-1 md:peer-data-[variant=inset]:ring-foreground/10',
			hostsWorkbenchPanes ? 'overflow-hidden' : 'overflow-y-auto'
		)}
		data-note-workbench={isNoteWorkbench ? '' : undefined}
	>
		<header
			class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2 md:hidden dark:bg-card"
		>
			<Sidebar.Trigger class="size-11" />
			<p class="min-w-0 flex-1 truncate px-1 text-sm font-semibold capitalize">{currentScreen}</p>
			<Button
				variant="ghost"
				size="icon"
				class="size-11"
				aria-label="Search notes, todos and commands"
				disabled={!contentReady || inventoryLoading}
				onclick={() => palette.open()}
			>
				<Icon.Search />
			</Button>
			{#if shell && !inventoryLoading}<MemoryNotificationMenu
					notifications={shell.pendingMemoryNotifications}
				/>{/if}
			<SyncStatusMenu
				resources={data.session.resources}
				startupFailure={data.session.startupError}
			/>
			<Button
				variant="ghost"
				size="icon"
				class="size-11"
				aria-label="Open chat"
				disabled={!prerequisitesReady || inventoryLoading}
				onclick={(event) => openChatSurface(event.currentTarget)}
			>
				<Icon.Chat />
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
		{#if shell && prerequisitesReady}
			<WorkspaceTabs
				{shell}
				sessions={data.session.sessions}
				hidden={workbench.stripHidden}
				oncreateNote={inventoryLoading ? undefined : () => void createNoteFromStrip()}
				ontoggleHidden={() => workbench.toggleStripHidden()}
			/>
		{/if}
		{#if contentReady}
			<WorkspaceRouteOutlet ready={routeReady}>{@render children()}</WorkspaceRouteOutlet>
		{:else}
			<WorkspaceStartup
				resources={data.session.resources}
				readiness={data.session.resources.startupReadiness}
				startupFailure={data.session.startupError}
			/>
		{/if}
	</Sidebar.Inset>
	{#if shell && prerequisitesReady && !inventoryLoading}
		<RightPanel
			{shell}
			sessions={data.session.sessions}
			agentPreferences={data.session.preferences}
			agentModels={data.session.agentModels}
			agentDefaults={data.session.agentDefaults}
			agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
			{activeNoteId}
			{openResource}
			{activeProjectId}
		/>
	{/if}
</Sidebar.Provider>

{#if shell && prerequisitesReady && !inventoryLoading}
	<CommandPalette {shell} />
{/if}
