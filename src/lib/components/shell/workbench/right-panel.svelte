<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import { FtPlus as Plus, FtClose as X } from '$lib/components/icons';
	import AgentSettingsPopover from '../../agent/preferences/agent-settings-popover.svelte';
	import { chat } from '$lib/stores/agent/chat.svelte';
	import { IsDockedPanel } from '$lib/hooks/is-docked-panel.svelte';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import ChatPanel from '../../chat/workspace/chat-panel.svelte';
	import MemoryPanel from '../../memory/workspace/memory-panel.svelte';
	import SuggestionsPanel from '../../suggestions/workspace/suggestions-panel.svelte';
	import TodoDetailPanel from '../../todos/workspace/todo-detail-panel.svelte';

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

	// The landmark keeps a plain noun — an accessible name is how the panel is found
	// in a landmark list, not where it makes its case. The heading is the case: the
	// surface drives an agent that writes notes, todos and memory, and "Agent" alone
	// let it read as a chatbot.
	const landmarkTitles = {
		chat: 'Agent',
		'todo-detail': 'Todo',
		'project-memory': 'Project memory',
		suggestions: 'Suggestions',
		closed: ''
	} as const;

	const headings = {
		...landmarkTitles,
		chat: 'Let FollowThrough act'
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

{#snippet chatHeaderActions()}
	<AgentSettingsPopover {agentModels} />
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
{/snippet}

{#if docked.current}
	<aside
		class="flex shrink-0 overflow-hidden rounded-xl bg-sidebar transition-[width,margin] duration-(--duration-panel) ease-(--ease-standard) {open
			? 'my-2 mr-2 w-96 ring-1 ring-foreground/10'
			: 'my-0 mr-0 w-0 ring-0'}"
		aria-label={landmarkTitles[renderedMode]}
		aria-hidden={!open}
		inert={!open}
	>
		<div class="flex h-full w-96 shrink-0 flex-col">
			<header class="flex h-12 shrink-0 items-center justify-between px-4">
				<h2 class="truncate text-sm font-medium">{headings[renderedMode]}</h2>
				<div class="flex items-center gap-1">
					{#if renderedMode === 'chat'}
						{@render chatHeaderActions()}
					{/if}
					<Tip text="Close panel">
						{#snippet children({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Close panel"
								onclick={() => rightPanel.close()}
							>
								<X data-icon />
							</Button>
						{/snippet}
					</Tip>
				</div>
			</header>
			<Separator />
			<div class="min-h-0 flex-1 p-4">
				<!--
					The boundary starts here, below the header: a panel that fails must
					still be closable, so the close button above stays outside it.
				-->
				<ErrorBoundary label="the {landmarkTitles[renderedMode].toLowerCase()} panel">
					{#if renderedMode === 'chat'}
						<ChatPanel
							{shell}
							{sessions}
							{activeNoteId}
							{activeProjectId}
							{agentPreferences}
							{agentAvailable}
							registerComposerFocus={(focus) => rightPanel.registerChatComposerFocus(focus)}
						/>
					{:else if renderedMode === 'todo-detail'}
						<!-- The gutter is the scrollbar's: it overlays the viewport's right edge
						     rather than reserving space, so a full-width field underneath it
						     loses its border to the track. -->
						<ScrollArea class="h-full">
							<div class="pr-3">
								<TodoDetailPanel view={rightPanel.todoView} notes={shell?.noteTree} />
							</div>
						</ScrollArea>
					{:else if renderedMode === 'project-memory'}
						<MemoryPanel />
					{:else if renderedMode === 'suggestions'}
						<ScrollArea class="h-full">
							<div class="pr-3">
								<SuggestionsPanel />
							</div>
						</ScrollArea>
					{/if}
				</ErrorBoundary>
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
				<div class="flex items-center justify-between gap-2">
					<Sheet.Title>{headings[renderedMode]}</Sheet.Title>
					{#if renderedMode === 'chat'}
						<div class="flex items-center gap-1">
							{@render chatHeaderActions()}
						</div>
					{/if}
				</div>
			</Sheet.Header>
			<div
				class="min-h-0 flex-1 p-4 {renderedMode === 'chat'
					? 'safe-panel-bottom overflow-hidden'
					: 'overflow-y-auto'}"
			>
				<ErrorBoundary label="the {landmarkTitles[renderedMode].toLowerCase()} panel">
					{#if renderedMode === 'chat'}
						<ChatPanel
							{shell}
							{sessions}
							{activeNoteId}
							{activeProjectId}
							{agentPreferences}
							{agentAvailable}
							registerComposerFocus={(focus) => rightPanel.registerChatComposerFocus(focus)}
						/>
					{:else if renderedMode === 'project-memory'}
						<MemoryPanel />
					{:else if renderedMode === 'suggestions'}
						<SuggestionsPanel />
					{/if}
				</ErrorBoundary>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
