<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { AgentModelDefaults } from '$lib/models/agent/model-label';
	import type { ShellContext } from '$lib/models/workspace';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import ChatPanel from './chat-panel.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { ChatStore } from '$lib/stores/agent/chat.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';

	let {
		shell,
		sessions,
		conversation,
		agentPreferences,
		agentModels,
		agentDefaults,
		agentAvailable
	}: {
		shell: ShellContext;
		sessions: readonly Conversation[];
		conversation?: Conversation;
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentDefaults: AgentModelDefaults;
		agentAvailable: boolean;
	} = $props();

	const browser = typeof window !== 'undefined';

	/**
	 * This page's session. Reusing the key an already-open surface holds for the
	 * same conversation matters: two stores against one conversation would both
	 * submit runs to it, and the server's active-run uniqueness index rejects
	 * whichever lands second.
	 */
	const sessionKey = untrack(
		() =>
			(conversation ? chatRegistry.keyForConversation(conversation.id) : undefined) ??
			chatRegistry.mint()
	);
	// Registry references are a browser concern. The registry is a module-level
	// map shared by every SSR request, so holding a freshly-minted key there
	// would leak one entry per render.
	const chat = untrack(() => (browser ? chatRegistry.for(sessionKey) : new ChatStore(sessionKey)));
	onDestroy(() => {
		if (browser) chatRegistry.release(sessionKey);
	});

	const note = $derived(shell.noteTree.find((entry) => entry.id === conversation?.contextNoteId));
	const project = $derived(
		shell.projects.find((entry) => entry.id === (conversation?.contextProjectId ?? note?.projectId))
	);
</script>

<main class="flex min-h-0 flex-1 flex-col bg-background">
	<header class="flex min-h-14 items-center border-b border-border px-4 md:px-6">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item><Breadcrumb.Link href="/chats">Chats</Breadcrumb.Link></Breadcrumb.Item>
				{#if project}
					<Breadcrumb.Separator />
					<Breadcrumb.Item
						><Breadcrumb.Link href="/projects/{project.id}">{project.name}</Breadcrumb.Link
						></Breadcrumb.Item
					>
				{/if}
				{#if note}
					<Breadcrumb.Separator />
					<Breadcrumb.Item
						><Breadcrumb.Link href="/notes/{note.id}">{note.title}</Breadcrumb.Link
						></Breadcrumb.Item
					>
				{/if}
				<Breadcrumb.Separator />
				<Breadcrumb.Item
					><Breadcrumb.Page>{conversation?.title ?? 'New chat'}</Breadcrumb.Page></Breadcrumb.Item
				>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</header>
	<div class="safe-panel-bottom mx-auto min-h-0 w-full max-w-4xl flex-1 px-4 pt-4 md:px-8">
		<ChatPanel
			{chat}
			{shell}
			{sessions}
			{agentPreferences}
			{agentModels}
			{agentDefaults}
			{agentAvailable}
			initialConversationId={conversation?.id ?? null}
			activeNoteId={conversation?.contextNoteId}
			activeProjectId={conversation?.contextProjectId ?? note?.projectId}
			showHistory={false}
		/>
	</div>
</main>
