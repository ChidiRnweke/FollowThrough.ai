<script lang="ts">
	import type {
		AgentModel,
		AgentPreferences,
		Conversation,
		NoteId,
		ProjectId,
		ShellContext
	} from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { chat } from '$lib/stores/chat.svelte';
	import { IsDockedPanel } from '$lib/hooks/is-docked-panel.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import ChatPanel from './panels/chat-panel.svelte';
	import MemoryPanel from './panels/memory-panel.svelte';
	import SuggestionsPanel from './panels/suggestions-panel.svelte';
	import TodoDetailPanel from './panels/todo-detail-panel.svelte';

	let {
		shell,
		sessions,
		agentPreferences,
		agentModels,
		agentAvailable,
		activeNoteId,
		activeProjectId
	}: {
		shell?: ShellContext;
		sessions: readonly Conversation[];
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentAvailable: boolean;
		activeNoteId?: NoteId;
		activeProjectId?: ProjectId;
	} = $props();

	const titles = {
		chat: 'Chat',
		'todo-detail': 'Todo',
		'project-memory': 'Project memory',
		suggestions: 'Suggestions',
		closed: ''
	} as const;

	const open = $derived(rightPanel.mode !== 'closed');
	// Only one surface is ever mounted. The sheet's overlay is portaled and has no
	// responsive class of its own, so leaving it mounted behind the docked aside
	// dimmed and blurred the whole app on desktop.
	const docked = new IsDockedPanel();
	// Keep the last visible mode rendered while the close animation runs.
	let renderedMode = $state<Exclude<typeof rightPanel.mode, 'closed'>>('chat');
	$effect(() => {
		if (rightPanel.mode !== 'closed') renderedMode = rightPanel.mode;
	});
</script>

{#if docked.current}
	<aside
		class="flex h-full shrink-0 overflow-hidden bg-sidebar transition-[width] duration-(--duration-panel) ease-(--ease-standard) {open
			? 'w-96 border-l border-border'
			: 'w-0 border-l border-transparent'}"
		aria-label={titles[renderedMode]}
		aria-hidden={!open}
		inert={!open}
	>
		<div class="flex h-full w-96 shrink-0 flex-col">
			<header class="flex h-12 shrink-0 items-center justify-between px-4">
				<h2 class="text-sm font-semibold">{titles[renderedMode]}</h2>
				<div class="flex items-center gap-1">
					{#if renderedMode === 'chat'}
						<Tip text="New chat">
							{#snippet children({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="New chat"
									onclick={() => chat.clear()}
								>
									<Plus data-icon />
								</Button>
							{/snippet}
						</Tip>
					{/if}
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Close panel"
						onclick={() => rightPanel.close()}
					>
						<X data-icon />
					</Button>
				</div>
			</header>
			<Separator />
			<div class="min-h-0 flex-1 p-4">
				{#if renderedMode === 'chat'}
					<ChatPanel
						{shell}
						{sessions}
						{activeNoteId}
						{activeProjectId}
						{agentPreferences}
						{agentModels}
						{agentAvailable}
					/>
				{:else if renderedMode === 'todo-detail'}
					<ScrollArea class="h-full">
						<TodoDetailPanel view={rightPanel.todoView} notes={shell?.noteTree} />
					</ScrollArea>
				{:else if renderedMode === 'project-memory'}
					<MemoryPanel />
				{:else if renderedMode === 'suggestions'}
					<ScrollArea class="h-full">
						<SuggestionsPanel />
					</ScrollArea>
				{/if}
			</div>
		</div>
	</aside>
{:else}
	<Sheet.Root
		open={open && renderedMode !== 'todo-detail'}
		onOpenChange={(value) => {
			if (!value) rightPanel.close();
		}}
	>
		<Sheet.Content
			side="right"
			class="flex w-full max-w-full flex-col p-0 sm:max-w-sm"
			overlayProps={{ class: 'bg-black/60 supports-backdrop-filter:backdrop-blur-none' }}
			onCloseAutoFocus={(event) => {
				if (renderedMode !== 'chat') return;
				event.preventDefault();
				rightPanel.restoreChatTriggerFocus();
			}}
		>
			<Sheet.Header class="shrink-0 border-b border-border px-4 py-3">
				<Sheet.Title>{titles[renderedMode]}</Sheet.Title>
			</Sheet.Header>
			<div
				class="min-h-0 flex-1 p-4 {renderedMode === 'chat'
					? 'overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))]'
					: 'overflow-y-auto'}"
			>
				{#if renderedMode === 'chat'}
					<ChatPanel
						{shell}
						{sessions}
						{activeNoteId}
						{activeProjectId}
						{agentPreferences}
						{agentModels}
						{agentAvailable}
					/>
				{:else if renderedMode === 'project-memory'}
					<MemoryPanel />
				{:else if renderedMode === 'suggestions'}
					<SuggestionsPanel />
				{/if}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
