<script lang="ts">
	import type { NoteId, ShellContext } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import House from '@lucide/svelte/icons/house';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import MessageSquareWarning from '@lucide/svelte/icons/message-square-warning';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import SunMoon from '@lucide/svelte/icons/sun-moon';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/palette.svelte';
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
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}

	let tree = $state<ReturnType<typeof ProjectTree>>();
	let feedbackOpen = $state(false);
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<div
			class="flex h-8 items-center justify-between gap-1 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2"
		>
			<a
				href="/"
				class="flex min-w-0 items-center gap-2 rounded-md"
				aria-label="FollowThrough — Today"
			>
				<BrandMark class="size-6 shrink-0" />
				<span
					class="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden"
				>
					FollowThrough
				</span>
			</a>
			<Sidebar.Trigger class="text-muted-foreground" />
		</div>
		<button
			type="button"
			class="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:hidden"
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
						<Sidebar.MenuButton isActive={isActive('/')} tooltipContent="Today">
							{#snippet child({ props })}
								<a href="/" {...props}>
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
			<Sidebar.GroupAction
				class="top-2.5 rounded-full"
				title="New project"
				onclick={() => tree?.openNewProject()}
			>
				<Plus class="size-4" />
				<span class="sr-only">New project</span>
			</Sidebar.GroupAction>
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
				<Button
					variant="ghost"
					size="icon-sm"
					class="hidden 2xl:inline-flex"
					aria-label="Toggle chat panel"
					title="Toggle chat panel"
					onclick={() => rightPanel.toggle('chat')}
				>
					<MessageSquare class="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					class="2xl:hidden"
					aria-label="Open chat"
					title="Open chat"
					href="/chats/new"
				>
					<MessageSquare />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Toggle theme"
					title="Toggle theme"
					onclick={toggleMode}
				>
					<SunMoon class="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Send feedback"
					title="Send feedback"
					onclick={() => (feedbackOpen = true)}
				>
					<MessageSquareWarning class="size-4" />
				</Button>
			</div>
		</div>
	</Sidebar.Footer>
	<Sidebar.Rail />
	<FeedbackDialog bind:open={feedbackOpen} />
</Sidebar.Root>
