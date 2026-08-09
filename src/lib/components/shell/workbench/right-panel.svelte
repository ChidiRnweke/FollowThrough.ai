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
	import { FtPlus as Plus, FtClose as X, FtExternal as ExternalLink } from '$lib/components/icons';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { chatTab, searchTab } from '$lib/stores/workbench/tab-ref';
	import AgentSettingsPopover from '../../agent/preferences/agent-settings-popover.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { IsDockedPanel } from '$lib/hooks/is-docked-panel.svelte';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import ChatPanel from '../../chat/workspace/chat-panel.svelte';
	import MemoryPanel from '../../memory/workspace/memory-panel.svelte';
	import SuggestionsPanel from '../../suggestions/workspace/suggestions-panel.svelte';
	import TodoDetailPanel from '../../todos/workspace/todo-detail-panel.svelte';
	import GlobalSearchPanel from '../../search/global-search-panel.svelte';

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
		search: 'Search',
		closed: ''
	} as const;

	const headings = {
		...landmarkTitles,
		chat: 'Let FollowThrough act'
	} as const;

	// The `w-96` below is mirrored by `RIGHT_PANEL_WIDTH_PX` in `$lib/models/workspace`,
	// which the shell reserves out of the sidebar's width budget. Change both together.
	const open = $derived(rightPanel.mode !== 'closed');
	// Only one surface is ever mounted. The sheet's overlay is portaled and has no
	// responsive class of its own, so leaving it mounted behind the docked aside
	// dimmed and blurred the whole app on desktop.
	const docked = new IsDockedPanel();
	// Re-resolves when "New chat" swaps the key, which is what re-keys the panel
	// onto a fresh transcript. `resident` rather than `for`: the panel's hold is
	// taken once, by the store itself, and must not be bumped per read.
	const chatSession = $derived(chatRegistry.resident(rightPanel.chatSessionKey));
	// Keep the last visible mode rendered while the close animation runs.
	let renderedMode = $state<Exclude<typeof rightPanel.mode, 'closed'>>('chat');
	$effect(() => {
		if (rightPanel.mode !== 'closed') renderedMode = rightPanel.mode;
	});
</script>

{#snippet chatHeaderActions()}
	<AgentSettingsPopover {agentModels} chat={chatSession} />
	<!-- The same session key, so the transcript moves into the workbench rather
	     than forking: the tab and the panel are two views of one conversation. -->
	<Tip text="Open in workbench">
		{#snippet children({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label="Open chat in workbench"
				onclick={() => {
					void workbench.openTab(chatTab(rightPanel.chatSessionKey));
					rightPanel.close();
				}}
			>
				<ExternalLink data-icon />
			</Button>
		{/snippet}
	</Tip>
	<Tip text="New chat">
		{#snippet children({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label="New chat"
				onclick={() => rightPanel.newChat()}
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
			<!-- `safe-panel-bottom` matches the mobile sheet and the full-page route, which
			     both already have it; without it the composer sat flush on the panel edge. -->
			<div class="safe-panel-bottom min-h-0 flex-1 overflow-hidden px-4 pt-4">
				<!--
					The boundary starts here, below the header: a panel that fails must
					still be closable, so the close button above stays outside it.
				-->
				<ErrorBoundary label="the {landmarkTitles[renderedMode].toLowerCase()} panel">
					{#if renderedMode === 'chat'}
						<ChatPanel
							chat={chatSession}
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
					{:else if renderedMode === 'search'}
						<GlobalSearchPanel
							projects={shell?.projects ?? []}
							onMoveToCanvas={() => {
								void workbench.openTab(searchTab());
								rightPanel.close();
							}}
						/>
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
							chat={chatSession}
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
					{:else if renderedMode === 'search'}
						<GlobalSearchPanel
							projects={shell?.projects ?? []}
							onMoveToCanvas={() => {
								void workbench.openTab(searchTab());
								rightPanel.close();
							}}
						/>
					{/if}
				</ErrorBoundary>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
