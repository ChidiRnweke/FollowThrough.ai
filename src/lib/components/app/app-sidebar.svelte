<script lang="ts">
	import type { NoteId, ShellContext } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import { sidebarToggle } from '$lib/stores/sidebar-toggle.svelte';
	import { Tip } from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils';
	import {
		FtToday as House,
		FtChat as MessageSquare,
		FtChatAlert as MessageSquareWarning,
		FtPlus as Plus,
		FtSearch as Search,
		FtSettings as Settings,
		FtTheme as SunMoon,
		FtProfile as UserRound,
		FtSkills as Wrench
	} from '$lib/components/icons';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/palette.svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import BrandMark from './brand-mark.svelte';
	import ProjectTree from './project-tree.svelte';
	import MemoryNotificationMenu from './memory-notification-menu.svelte';
	import FeedbackDialog from './feedback-dialog.svelte';

	let {
		shell,
		activePath,
		activeNoteId,
		loading = false
	}: {
		shell: ShellContext;
		activePath: string;
		activeNoteId?: NoteId;
		loading?: boolean;
	} = $props();

	const secondaryItems = $derived([
		{ href: '/skills', label: 'Skills', icon: Wrench, badge: 0 },
		{ href: '/profile', label: 'Profile', icon: UserRound, badge: 0 },
		{ href: '/settings', label: 'Settings', icon: Settings, badge: 0 }
	]);

	function isActive(href: string): boolean {
		return activePath.startsWith(href);
	}

	let tree = $state<ReturnType<typeof ProjectTree>>();
	let feedbackOpen = $state(false);

	// Two split note panes plus an expanded sidebar is where reading width runs
	// out first.  Rather than adding another control, the trigger already here
	// takes the accent and says what collapsing buys.  The `max-xl:` gate below
	// keeps it muted on displays wide enough for a comfortable split.
	const sidebar = useSidebar();
	const spaceTight = $derived(workbench.splitActive && sidebar.state === 'expanded');

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
		<button
			type="button"
			class="tactile flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:hidden"
			aria-label="Search notes, todos and commands"
			onclick={() => palette.open()}
		>
			<Search class="size-4 shrink-0" />
			<span class="truncate">Search…</span>
			<Kbd class="ml-auto">⌘K</Kbd>
		</button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="hidden self-center group-data-[collapsible=icon]:flex"
			aria-label="Search notes, todos and commands"
			onclick={() => palette.open()}
		>
			<Search class="size-4" />
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
						class="top-2.5 rounded-full"
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
		<Sidebar.Group class="mt-auto pt-1 pb-2">
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each secondaryItems as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<item.icon class="size-4" />
										<span>{item.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
							{#if item.badge > 0}
								<Sidebar.MenuBadge>
									<Badge variant="secondary">{item.badge}</Badge>
								</Sidebar.MenuBadge>
							{/if}
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Separator />
	<Sidebar.Footer class="pb-3">
		<div
			class="flex items-center justify-between group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1"
		>
			<span
				class="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
			>
				{shell.user.displayName}
			</span>
			<div class="flex items-center group-data-[collapsible=icon]:flex-col">
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
