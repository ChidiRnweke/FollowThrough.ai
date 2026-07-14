<script lang="ts">
	import type {
		AgentModel,
		AgentPreferences,
		NoteId,
		ShellContext,
		TodoId,
		TodoStatus
	} from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import X from '@lucide/svelte/icons/x';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import ChatPanel from './panels/chat-panel.svelte';
	import TodoDetailPanel from './panels/todo-detail-panel.svelte';

	let {
		shell,
		agentPreferences,
		agentModels,
		activeNoteId,
		onstatus
	}: {
		shell?: ShellContext;
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		activeNoteId?: NoteId;
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
	} = $props();

	const titles = {
		chat: 'Chat',
		'todo-detail': 'Todo',
		closed: ''
	} as const;

	const open = $derived(rightPanel.mode !== 'closed');
	// Keep the last visible mode rendered while the close animation runs.
	let renderedMode = $state<Exclude<typeof rightPanel.mode, 'closed'>>('chat');
	$effect(() => {
		if (rightPanel.mode !== 'closed') renderedMode = rightPanel.mode;
	});
</script>

<aside
	class="hidden h-full shrink-0 overflow-hidden bg-sidebar transition-[width] duration-(--duration-panel) ease-(--ease-standard) md:flex {open
		? 'w-96 border-l border-border'
		: 'w-0 border-l border-transparent'}"
	aria-label={titles[renderedMode]}
	aria-hidden={!open}
	inert={!open}
>
	<div class="flex h-full w-96 shrink-0 flex-col">
		<header class="flex h-12 shrink-0 items-center justify-between px-4">
			<h2 class="text-sm font-semibold">{titles[renderedMode]}</h2>
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
			{#if renderedMode === 'chat'}
				<ChatPanel {shell} {activeNoteId} {agentPreferences} {agentModels} />
			{:else if renderedMode === 'todo-detail'}
				<ScrollArea class="h-full">
					<TodoDetailPanel {onstatus} />
				</ScrollArea>
			{/if}
		</div>
	</div>
</aside>
