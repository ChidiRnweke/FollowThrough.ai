<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import { canvasSubjectKey } from '$lib/stores/diagrams/canvas-subject';
	import { canvasFor } from '$lib/stores/diagrams/canvas.svelte';
	import { canvasOpenings } from '$lib/stores/diagrams/canvas-opening.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { chatTab } from '$lib/stores/workbench/tab-ref';
	import { appContext } from '$lib/stores/agent/app-context.svelte';
	import { ChatPanel } from '$lib/components/chat';
	import { AgentSettingsPopover } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtClose as X } from '$lib/components/icons';

	let {
		sessionKey,
		shell,
		sessions,
		agentPreferences,
		agentModels,
		agentAvailable,
		onCloseSplit
	}: {
		sessionKey: ChatSessionKey;
		shell: ShellContext;
		sessions: readonly Conversation[];
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentAvailable: boolean;
		onCloseSplit?: () => void;
	} = $props();

	// The same acquire-on-mount / release-on-destroy lifetime `note-pane.svelte`
	// uses for its four note registries. `sessionKey` is stable: the pane is keyed
	// by its tab id in `workspace-panes.svelte`.
	const chat = untrack(() => chatRegistry.for(sessionKey));

	const title = $derived(
		sessions.find((entry) => entry.id === chat.conversationId)?.title ?? 'New chat'
	);

	// The pane tells the app context what it holds, the same inversion the note
	// panes use — the agent's snapshot then names the chats open beside it.
	// Registered in `onMount` like `note-pane.svelte`, so `sessionKey` is read
	// where it is stable rather than captured during init.
	// The project a studio conversation belongs to. `ChatPanel` turns it into the
	// run's `projectId`, which becomes the conversation's own project on its first
	// turn — without it a studio chat is scoped to nothing and its diagram has no
	// project to be kept in.
	const draftProjectId = $derived(diagramRegistry.draftProject(sessionKey));

	// The canvas opens when the conversation has drafted something the canvas has
	// not shown yet, and never for a background tab — a chat the user is not looking
	// at must not take the split out from under the one they are.
	const canvas = $derived(canvasFor(sessionKey));
	$effect(() => {
		if (workbench.focusedTabId !== chatTab(sessionKey)) return;
		const key = canvasSubjectKey(canvas.subject);
		if (!canvasOpenings.shouldOpen(sessionKey, key) || !canvas.tab) return;
		canvasOpenings.markShown(sessionKey, key);
		void workbench.setSplit(canvas.tab);
	});

	let releaseContext: (() => void) | undefined;
	onMount(() => {
		releaseContext = appContext.registerChatPane(sessionKey, () => ({
			title,
			...(chat.conversationId ? { conversationId: chat.conversationId } : {})
		}));
	});

	onDestroy(() => {
		releaseContext?.();
		chatRegistry.release(sessionKey);
	});
</script>

<div class="flex h-full w-full min-w-0 flex-1 flex-col" data-chat-pane={sessionKey}>
	<!--
		The header shares the transcript's measure rather than spanning the pane, so
		the title sits over the conversation it names instead of drifting out to the
		pane edge. 16px beneath it: chrome is a different kind of thing from content,
		but a closer one than two turns are to each other.
	-->
	<header class="mx-auto flex min-h-10 w-full max-w-3xl shrink-0 items-center gap-2 pb-4">
		<h2 class="truncate text-sm font-medium">{title}</h2>
		<div class="ml-auto flex items-center gap-1">
			<AgentSettingsPopover {agentModels} {chat} />
			{#if onCloseSplit}
				<Tip text="Close split view">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Close split view"
							onclick={onCloseSplit}
						>
							<X />
						</Button>
					{/snippet}
				</Tip>
			{/if}
		</div>
	</header>
	<div class="min-h-0 flex-1">
		<ChatPanel
			{chat}
			{shell}
			{sessions}
			{agentPreferences}
			{agentAvailable}
			activeProjectId={draftProjectId}
			showHistory={false}
		/>
	</div>
</div>
