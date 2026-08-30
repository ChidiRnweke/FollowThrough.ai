<script lang="ts">
	import type { NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import { sidebarToggle } from '$lib/stores/shell/sidebar-toggle.svelte';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Separator } from '$lib/components/ui/separator';
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
		FtProfile as UserRound,
		FtSkills as Wrench
	} from '$lib/components/icons';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Settings from '@lucide/svelte/icons/settings';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/shell/palette.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import BrandMark from '../../shared/brand-mark.svelte';
	import ProjectTree from '../../projects/project-tree.svelte';
	import MemoryNotificationMenu from '../../memory/memory-notification-menu.svelte';
	import FeedbackDialog from '../../feedback/feedback-dialog.svelte';

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

	// The rail is sorted by what a thing *is*: destinations at the top (profile among
	// them), your projects filling the middle, and your tools at the bottom — find,
	// settings, trash — under an identity row rather than as rows beside content.
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
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={isActive('/profile')} tooltipContent="Profile">
							{#snippet child({ props })}
								<a {...props} href="/profile">
									<UserRound class="size-4" />
									<span>Profile</span>
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
	<Sidebar.Footer class="gap-0 p-0 pb-3">
		<!-- The identity row is who you are, not a menu: it links to /profile (which
		     also sits in the destinations above), and the email keeps a home in the
		     tooltip. No chevron — there is no dropdown behind it. -->
		<div
			class="px-2 pt-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
		>
			<Tip text={shell.user.email} side="top">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						href="/profile"
						class="tactile flex h-8 w-full min-w-0 items-center justify-start gap-2 rounded-md px-2 text-sm font-normal group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
						aria-label="Profile for {shell.user.displayName}"
					>
						<UserRound class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate group-data-[collapsible=icon]:hidden"
							>{shell.user.displayName}</span
						>
					</Button>
				{/snippet}
			</Tip>
		</div>
		<Sidebar.Separator class="mx-0 my-1" />
		<!-- One airy strip, not a segmented control: ticks only mark the jump cluster
		     (find, memories, chat); the app-chrome buttons stand alone, and trash sits
		     apart, pinned right in destructive — it is the only command that destroys,
		     so distance and colour keep it away from the toggles.

		     Buttons are size-7 rather than icon-sm: seven commands plus ticks need
		     ~230px and the bar's floor is the rail's 192px minimum less padding — the
		     strip wraps to a second line instead of overflowing. -->
		<div
			class="flex flex-wrap items-center px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1"
		>
			<div
				class="flex flex-wrap items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1"
			>
				<Tip text="Find in notes" shortcut="⌘⇧F">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Find in notes"
							aria-pressed={rightPanel.mode === 'search'}
							class={cn('size-7', rightPanel.mode === 'search' && 'bg-accent text-brand')}
							onclick={() => rightPanel.toggle('search')}
						>
							<Search class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<Separator orientation="vertical" class="h-3.5! group-data-[collapsible=icon]:hidden" />
				<MemoryNotificationMenu notifications={shell.pendingMemoryNotifications} class="size-7" />
				<Separator orientation="vertical" class="h-3.5! group-data-[collapsible=icon]:hidden" />
				<Tip text="Toggle chat panel">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="hidden size-7 lg:inline-flex"
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
							class="size-7 lg:hidden"
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
							class="size-7"
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
							class="size-7"
							onclick={() => (feedbackOpen = true)}
						>
							<MessageSquareWarning class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Settings">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Settings"
							href="/settings"
							class={cn('size-7', isActive('/settings') && 'bg-accent text-brand')}
						>
							<Settings class="size-4" />
						</Button>
					{/snippet}
				</Tip>
			</div>
			<Tip text="Trash">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label="Trash"
						href="/trash"
						class={cn(
							'size-7 ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive group-data-[collapsible=icon]:ml-0',
							isActive('/trash') && 'bg-destructive/15'
						)}
					>
						<Trash class="size-4" />
					</Button>
				{/snippet}
			</Tip>
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
	<FeedbackDialog bind:open={feedbackOpen} />
</Sidebar.Root>
