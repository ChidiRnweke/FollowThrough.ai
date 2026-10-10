<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace-views';

	import type { NoteId } from '$lib/models/notes';

	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import { sidebarToggle } from '$lib/stores/shell/sidebar-toggle.svelte';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as Avatar from '$lib/components/ui/avatar';
	import { cn } from '$lib/utils';
	import {
		FtArrowRight as ArrowRight,
		FtToday as House,
		FtChat as MessageSquare,
		FtChatAlert as MessageSquareWarning,
		FtPlus as Plus,
		FtSearch as Search,
		FtTheme as SunMoon,
		FtTrash as Trash,
		FtSkills as Wrench
	} from '$lib/components/icons';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Settings from '@lucide/svelte/icons/settings';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/shell/palette.svelte';
	import { workbench } from '$lib/factories/workbench/workbench';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import BrandMark from '../../shared/brand-mark.svelte';
	import ProjectTree from '../../projects/project-tree.svelte';
	import MemoryNotificationMenu from '../../memory/memory-notification-menu.svelte';
	import SyncStatusMenu from '../sync/sync-status-menu.svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import FeedbackDialog from '../../feedback/feedback-dialog.svelte';
	import { initialsOf } from '$lib/services/workspace/initials';
	import type { Component } from 'svelte';

	let {
		shell,
		activePath,
		activeNoteId,
		loading = false,
		squeezed = false,
		inventoryLoading = false
	}: {
		shell: ShellContext | null;
		inventoryLoading?: boolean;
		activePath: string;
		activeNoteId?: NoteId;
		loading?: boolean;
		/** The shell is rendering the sidebar narrower than the width the user chose. */
		squeezed?: boolean;
	} = $props();

	// Two columns, sorted by what a thing *is*. The icon rail is the gutter and is
	// always on screen: the mark and the panel toggle, then destinations, then the
	// jump tools, and the app chrome with you — the avatar — at the foot. The panel
	// beside it holds only your projects, so the tree gets the height. The panel and
	// the content are two sibling insets; collapsing the panel leaves the rail alone.
	function isActive(href: string): boolean {
		return activePath.startsWith(href);
	}

	let tree = $state<ReturnType<typeof ProjectTree>>();
	let feedbackOpen = $state(false);

	// Two split note panes plus an expanded sidebar is where reading width runs
	// out first.  Rather than adding another control, the trigger already here
	// takes the accent and says what collapsing buys.  The `max-xl:` gate below
	// keeps it muted on displays wide enough for a comfortable split.
	//
	// `squeezed` covers the case the cue was written for but could not see: the
	// shell has already clawed width back off the sidebar to protect the content,
	// so collapsing is the only room left to give.
	const sidebar = useSidebar();
	const spaceTight = $derived((workbench.splitActive || squeezed) && sidebar.state === 'expanded');

	// The toggle lives in a context the command registry cannot read, so hand it over
	// while this shell is mounted.
	$effect(() => sidebarToggle.register(sidebar.toggle));

	const destinations: readonly { href: string; label: string; icon: Component }[] = [
		{ href: '/today', label: 'Today', icon: House },
		{ href: '/todos', label: 'Todos', icon: ListTodo },
		{ href: '/skills', label: 'Skills', icon: Wrench }
	];

	const railButton = 'size-9 text-muted-foreground hover:text-foreground';
	const railActive = 'bg-accent text-brand hover:text-brand';
</script>

<Sidebar.Root collapsible="icon" variant="inset">
	<div class="flex size-full min-h-0">
		<Sidebar.IconRail aria-label="App">
			<div class="flex flex-col items-center gap-1">
				<a
					href="/today"
					class="flex size-9 items-center justify-center rounded-md"
					aria-label="FollowThrough — Today"
				>
					<BrandMark class="size-7" />
				</a>
				<Tip
					text={spaceTight ? 'Collapse the sidebar for more room' : 'Toggle sidebar'}
					shortcut="⌘\"
					side="right"
				>
					{#snippet children({ props })}
						<Sidebar.Trigger
							{...props}
							class={cn(railButton, spaceTight && 'max-xl:text-primary')}
						/>
					{/snippet}
				</Tip>
			</div>
			<div
				class="flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-auto overscroll-contain"
			>
				<div class="flex flex-col items-center gap-1">
					{#each destinations as destination (destination.href)}
						<Tip text={destination.label} side="right">
							{#snippet children({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									href={destination.href}
									aria-label={destination.label}
									aria-current={isActive(destination.href) ? 'page' : undefined}
									class={cn(railButton, isActive(destination.href) && railActive)}
								>
									<destination.icon class="size-5" />
								</Button>
							{/snippet}
						</Tip>
					{/each}
				</div>
				<div class="flex flex-col items-center gap-1">
					<!-- Only while the panel and its "Go to…" field are out of sight. -->
					<Tip text="Go to a note or run an action" shortcut="⌘K" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class={cn(
									railButton,
									'group-data-[state=expanded]:hidden in-data-[mobile=true]:hidden'
								)}
								aria-label="Go to a note or run an action"
								disabled={!shell || inventoryLoading}
								onclick={() => palette.open()}
							>
								<ArrowRight class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Find in notes" shortcut="⌘⇧F" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Find in notes"
								aria-pressed={rightPanel.mode === 'search'}
								class={cn(railButton, rightPanel.mode === 'search' && railActive)}
								disabled={inventoryLoading || !shell}
								onclick={() => rightPanel.toggle('search')}
							>
								<Search class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Toggle chat panel" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class={cn(
									railButton,
									'hidden lg:inline-flex',
									rightPanel.mode === 'chat' && railActive
								)}
								aria-label="Toggle chat panel"
								disabled={inventoryLoading || !shell}
								onclick={() => rightPanel.toggle('chat')}
							>
								<MessageSquare class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Open chat" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class={cn(railButton, 'lg:hidden')}
								aria-label="Open chat"
								href="/chats/new"
							>
								<MessageSquare class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					{#if shell && !inventoryLoading}<MemoryNotificationMenu
							notifications={shell.pendingMemoryNotifications}
							class={railButton}
							side="right"
						/>{/if}
					{#if workspaceSession.current}<SyncStatusMenu
							resources={workspaceSession.current.resources}
							startupFailure={workspaceSession.current.startupError}
							side="right"
						/>{/if}
				</div>
				<!-- App chrome at the foot, trash last and in destructive: it is the only
				     command here that destroys, so distance and colour keep it apart. -->
				<div class="mt-auto flex flex-col items-center gap-1">
					<Tip text="Toggle theme" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Toggle theme"
								class={railButton}
								onclick={toggleMode}
							>
								<SunMoon class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Send feedback" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Send feedback"
								class={railButton}
								onclick={() => (feedbackOpen = true)}
							>
								<MessageSquareWarning class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Settings" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Settings"
								href="/settings"
								class={cn(railButton, isActive('/settings') && railActive)}
							>
								<Settings class="size-5" />
							</Button>
						{/snippet}
					</Tip>
					<Tip text="Trash" side="right">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Trash"
								href="/trash"
								class={cn(
									'size-9 text-destructive hover:bg-destructive/10 hover:text-destructive',
									isActive('/trash') && 'bg-destructive/15'
								)}
							>
								<Trash class="size-5" />
							</Button>
						{/snippet}
					</Tip>
				</div>
			</div>
			<!-- Who you are, not a menu: the avatar links to /profile and the email keeps
			     a home in the tooltip. Until the account arrives the circle holds its
			     place, empty and inert. -->
			{#if shell}<Tip text={shell.user.email} side="right">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							href="/profile"
							class={cn('size-9 rounded-full', isActive('/profile') && 'ring-2 ring-brand/40')}
							aria-label="Profile for {shell.user.displayName}"
							aria-current={isActive('/profile') ? 'page' : undefined}
						>
							<Avatar.Root class="size-8 after:hidden">
								<Avatar.Fallback
									class="bg-brand/15 text-xs font-medium tracking-wide text-brand dark:bg-brand/20"
								>
									{initialsOf(shell.user.displayName)}
								</Avatar.Fallback>
							</Avatar.Root>
						</Button>
					{/snippet}
				</Tip>
			{:else}<Tip text="Loading your account…" side="right">
					{#snippet children({ props })}
						<span
							{...props}
							role="img"
							aria-label="Loading your account…"
							class="flex size-9 items-center justify-center"
						>
							<Avatar.Root class="size-8 after:hidden">
								<Avatar.Fallback class="bg-muted" />
							</Avatar.Root>
						</span>
					{/snippet}
				</Tip>{/if}
		</Sidebar.IconRail>
		<!-- A sibling inset of the content: same corners, same outward ring, same 8px
		     margin, so the two cards' edges land on the same rows. The wordmark row is
		     the tab strip's 40px, so the two headers read as one line across the gutter. -->
		<div
			data-slot="sidebar-panel"
			class="my-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10 group-data-[collapsible=icon]:hidden in-data-[mobile=true]:me-2 dark:bg-card"
		>
			<Sidebar.Header class="gap-2 px-3 pt-0">
				<a
					href="/today"
					class="flex h-10 min-w-0 items-center rounded-md px-1 text-base font-semibold tracking-tight"
				>
					<span class="truncate">FollowThrough</span>
				</a>
				<!-- "Go to…", not "Search…". This navigates — to a note by name, or to an
				     action — which is the opposite pole from finding text inside notes. The
				     two wore the same word and did different jobs; naming this one for what
				     it does is what keeps them apart. Full-text search is "Find in notes",
				     in the rail. -->
				<Button
					variant="outline"
					type="button"
					class="tactile flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
					aria-label="Go to a note or run an action"
					disabled={!shell || inventoryLoading}
					onclick={() => palette.open()}
				>
					<ArrowRight class="size-4 shrink-0" />
					<span class="truncate">Go to…</span>
					<Kbd class="ml-auto">⌘K</Kbd>
				</Button>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.Group
					class="min-h-0 flex-1 overflow-y-auto gap-y-1 py-1 data-loading:pointer-events-none"
					data-loading={loading || undefined}
				>
					<Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
					<Tip text="New project">
						{#snippet children({ props })}
							<Sidebar.GroupAction
								{...props}
								class="top-3 rounded-full"
								disabled={inventoryLoading || !shell}
								onclick={() => tree?.openNewProject()}
							>
								<Plus class="size-4" />
								<span class="sr-only">New project</span>
							</Sidebar.GroupAction>
						{/snippet}
					</Tip>
					<Sidebar.GroupContent>
						{#if !shell || ((loading || inventoryLoading) && !shell.projects.length)}
							<Sidebar.Menu>
								{#each [0, 1, 2, 3] as index (index)}
									<Sidebar.MenuItem data-skeleton-index={index}>
										<Sidebar.MenuSkeleton showIcon />
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						{:else}
							<ProjectTree
								bind:this={tree}
								inventoryReady={!inventoryLoading}
								projects={shell.projects}
								noteTree={shell.noteTree}
								{activeNoteId}
								{activePath}
							/>
						{/if}
					</Sidebar.GroupContent>
					{#if inventoryLoading}<p class="px-2 py-1 text-xs text-muted-foreground">
							Downloading workspace…
						</p>{/if}
				</Sidebar.Group>
			</Sidebar.Content>
		</div>
	</div>
	<Sidebar.Rail />
	<FeedbackDialog bind:open={feedbackOpen} />
</Sidebar.Root>
