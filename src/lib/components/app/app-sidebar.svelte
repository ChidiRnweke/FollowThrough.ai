<script lang="ts">
	import type { NoteId, ShellContext } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Kbd } from '$lib/components/ui/kbd';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import House from '@lucide/svelte/icons/house';
	import Inbox from '@lucide/svelte/icons/inbox';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Settings from '@lucide/svelte/icons/settings';
	import SunMoon from '@lucide/svelte/icons/sun-moon';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/palette.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import NoteTree from './note-tree.svelte';

	let {
		shell,
		activePath,
		activeNoteId
	}: {
		shell: ShellContext;
		activePath: string;
		activeNoteId?: NoteId;
	} = $props();

	const items = $derived([
		{ href: '/', label: 'Today', icon: House, badge: 0 },
		{ href: '/todos', label: 'Todos', icon: ListTodo, badge: 0 },
		{ href: '/skills', label: 'Skills', icon: Wrench, badge: 0 },
		{
			href: '/suggestions',
			label: 'Suggestions',
			icon: Inbox,
			badge: shell.pendingSuggestionCount
		},
		{ href: '/settings', label: 'Settings', icon: Settings, badge: 0 }
	]);

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}
</script>

<aside
	class="hidden h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
>
	<div class="flex h-12 shrink-0 items-center justify-between px-4">
		<span class="text-sm font-semibold tracking-tight">Workbench</span>
		<Button
			variant="ghost"
			size="sm"
			class="h-7 gap-1 px-1.5 text-muted-foreground"
			onclick={() => palette.open()}
		>
			<Kbd>⌘K</Kbd>
		</Button>
	</div>
	<Separator class="bg-sidebar-border" />
	<div class="flex flex-col gap-0.5 p-2" role="navigation" aria-label="Main">
		{#each items as item (item.href)}
			<Button
				variant="ghost"
				size="sm"
				href={item.href}
				class="w-full justify-start gap-2 font-normal {isActive(item.href)
					? 'bg-sidebar-accent font-medium text-sidebar-primary'
					: 'text-sidebar-foreground'}"
			>
				<item.icon class="size-4" />
				{item.label}
				{#if item.badge > 0}
					<Badge variant="secondary" class="ml-auto">{item.badge}</Badge>
				{/if}
			</Button>
		{/each}
	</div>
	<Separator class="bg-sidebar-border" />
	<ScrollArea class="min-h-0 flex-1 p-2">
		<p class="px-2 pb-1 text-xs font-medium text-muted-foreground">Notes</p>
		<NoteTree notes={shell.noteTree} {activeNoteId} />
	</ScrollArea>
	<Separator class="bg-sidebar-border" />
	<div class="flex shrink-0 items-center justify-between p-2">
		<span class="truncate px-2 text-xs text-muted-foreground">{shell.user.displayName}</span>
		<div class="flex items-center">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Toggle chat"
				onclick={() => rightPanel.toggle('chat')}
			>
				<MessageSquare class="size-4" />
			</Button>
			<Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onclick={toggleMode}>
				<SunMoon class="size-4" />
			</Button>
		</div>
	</div>
</aside>
