<script lang="ts">
	import type { NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import { sidebarToggle } from '$lib/stores/shell/sidebar-toggle.svelte';
	import { Tip } from '$lib/components/ui/tooltip';
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
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/shell/palette.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import BrandMark from '../../shared/brand-mark.svelte';
	import ProjectTree from '../../projects/project-tree.svelte';
	import MemoryNotificationMenu from '../../memory/memory-notification-menu.svelte';
	import FeedbackDialog from '../../feedback/feedback-dialog.svelte';
	import AccountMenu from './account-menu.svelte';

	let {
		shell,
		activePath,
		activeNoteId,
		loading = false,
		squeezed = false
	}: {
		shell: ShellContext;
		activePath: string;
		activeNoteId?: NoteId;
		loading?: boolean;
		/** The shell is rendering the sidebar narrower than the width the user chose. */
		squeezed?: boolean;
	} = $props();

	// The rail is sorted by what a thing *is*: destinations at the top, your projects
	// filling the middle, and you at the bottom. Tools (find, trash) and account chrome
	// (profile, settings) are neither, so they live in the footer — the icon bar and the
	// account menu respectively — rather than as rows beside content.
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
</script>

<Sidebar.Root collapsible="icon" variant="inset">
	<Sidebar.Header>
		<div
			class="flex h-8 items-center justify-between gap-1 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2"
		>
			<a
				href="/today"
				class="flex min-w-0 items-center gap-2 rounded-md"
				aria-label="FollowThrough — Today"
			>
				<BrandMark class="size-7 shrink-0" />
				<span
					class="truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden"
				>
					FollowThrough
				</span>
			</a>
			<Tip
				text={spaceTight ? 'Collapse the sidebar for more room' : 'Toggle sidebar'}
				shortcut="⌘B"
				side="bottom"
			>
				{#snippet children({ props })}
					<Sidebar.Trigger
						{...props}
						class={cn('text-muted-foreground', spaceTight && 'max-xl:text-primary')}
					/>
				{/snippet}
			</Tip>
		</div>
		<!-- "Go to…", not "Search…". This navigates — to a note by name, or to an
		     action — which is the opposite pole from finding text inside notes. The
		     two wore the same word and did different jobs; naming this one for what
		     it does is what keeps them apart. Full-text search is "Find in notes",
		     down in TOOLS. -->
		<Button
			variant="outline"
			type="button"
			class="tactile flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:hidden"
			aria-label="Go to a note or run an action"
			onclick={() => palette.open()}
		>
			<ArrowRight class="size-4 shrink-0" />
			<span class="truncate">Go to…</span>
			<Kbd class="ml-auto">⌘K</Kbd>
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="hidden self-center group-data-[collapsible=icon]:flex"
			aria-label="Go to a note or run an action"
			onclick={() => palette.open()}
		>
			<ArrowRight class="size-4" />
		</Button>
	</Sidebar.Header>
	<Sidebar.Separator />
	<Sidebar.Content>
		<Sidebar.Group class="py-1">
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={isActive('/today')} tooltipContent="Today">
							{#snippet child({ props })}
								<a href="/today" {...props}>
									<House class="size-4" />
									<span>Today</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={isActive('/todos')} tooltipContent="Todos">
							{#snippet child({ props })}
								<a {...props} href="/todos">
									<ListTodo class="size-4" />
									<span>Todos</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={isActive('/skills')} tooltipContent="Skills">
							{#snippet child({ props })}
								<a {...props} href="/skills">
									<Wrench class="size-4" />
									<span>Skills</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
		<Sidebar.Group
			class="min-h-0 flex-1 overflow-y-auto py-1 group-data-[collapsible=icon]:hidden gap-y-1 data-loading:pointer-events-none"
			data-loading={loading || undefined}
		>
			<Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
			<Tip text="New project">
				{#snippet children({ props })}
					<Sidebar.GroupAction
						{...props}
						class="top-3 rounded-full"
						onclick={() => tree?.openNewProject()}
					>
						<Plus class="size-4" />
						<span class="sr-only">New project</span>
					</Sidebar.GroupAction>
				{/snippet}
			</Tip>
			<Sidebar.GroupContent>
				{#if loading && !shell.projects.length}
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
						projects={shell.projects}
						noteTree={shell.noteTree}
						{activeNoteId}
						{activePath}
					/>
				{/if}
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Separator />
	<Sidebar.Footer class="pb-3">
		<div class="flex min-w-0 flex-col gap-1 group-data-[collapsible=icon]:items-center">
			<AccountMenu displayName={shell.user.displayName} email={shell.user.email} />
			<!-- Search and trash live here rather than in a labelled group of their own: a
			     region for two links, pinned bottom with `mt-auto` against a `flex-1`
			     Projects, floated free of everything around it. A magnifier and a bin are
			     the two glyphs that need no caption, so the bar absorbs them and the tree
			     gets the height back.

			     `flex-wrap` because six `size-8` buttons need 192px and the rail's floor is
			     `SIDEBAR_WIDTH_MIN_PX` (192) less the footer's own `p-2` — at the minimum
			     width they wrap to a second line instead of overflowing. -->
			<div
				class="flex flex-wrap items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1"
			>
				<Tip text="Find in notes" shortcut="⌘⇧F">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Find in notes"
							aria-pressed={rightPanel.mode === 'search'}
							class={rightPanel.mode === 'search' ? 'bg-accent text-brand' : ''}
							onclick={() => rightPanel.toggle('search')}
						>
							<Search class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Trash">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Trash"
							href="/trash"
							class={isActive('/trash') ? 'bg-accent text-brand' : ''}
						>
							<Trash class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<MemoryNotificationMenu notifications={shell.pendingMemoryNotifications} />
				<Tip text="Toggle chat panel">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="hidden lg:inline-flex"
							aria-label="Toggle chat panel"
							onclick={() => rightPanel.toggle('chat')}
						>
							<MessageSquare class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Open chat">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="lg:hidden"
							aria-label="Open chat"
							href="/chats/new"
						>
							<MessageSquare />
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Toggle theme">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Toggle theme"
							onclick={toggleMode}
						>
							<SunMoon class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Send feedback">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Send feedback"
							onclick={() => (feedbackOpen = true)}
						>
							<MessageSquareWarning class="size-4" />
						</Button>
					{/snippet}
				</Tip>
			</div>
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
	<FeedbackDialog bind:open={feedbackOpen} />
</Sidebar.Root>
