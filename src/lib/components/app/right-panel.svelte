<script lang="ts">
	import type { TodoId, TodoStatus } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import X from '@lucide/svelte/icons/x';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import ChatPanel from './panels/chat-panel.svelte';
	import SuggestionsPanel from './panels/suggestions-panel.svelte';
	import TodoDetailPanel from './panels/todo-detail-panel.svelte';

	let {
		onstatus
	}: {
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
	} = $props();

	const titles = {
		chat: 'Chat',
		suggestions: 'Suggestions',
		'todo-detail': 'Todo',
		closed: ''
	} as const;
</script>

{#if rightPanel.mode !== 'closed'}
	<aside
		class="hidden h-full w-96 shrink-0 flex-col border-l border-border bg-sidebar md:flex"
		aria-label={titles[rightPanel.mode]}
	>
		<header class="flex h-12 shrink-0 items-center justify-between px-4">
			<h2 class="text-sm font-semibold">{titles[rightPanel.mode]}</h2>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Close panel"
				onclick={() => rightPanel.close()}
			>
				<X class="size-4" />
			</Button>
		</header>
		<Separator />
		<div class="min-h-0 flex-1 p-4">
			{#if rightPanel.mode === 'chat'}
				<ChatPanel />
			{:else if rightPanel.mode === 'suggestions'}
				<ScrollArea class="h-full">
					<SuggestionsPanel />
				</ScrollArea>
			{:else if rightPanel.mode === 'todo-detail'}
				<ScrollArea class="h-full">
					<TodoDetailPanel {onstatus} />
				</ScrollArea>
			{/if}
		</div>
	</aside>
{/if}
