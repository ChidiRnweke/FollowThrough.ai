<script lang="ts">
	import type { AgentModel, AgentPreferences, Conversation } from '$lib/models/agent';
	import type { ShellContext } from '$lib/models/workspace';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import ChatPanel from './chat-panel.svelte';
	import { AgentSettingsPopover } from '$lib/components/agent';

	let {
		shell,
		sessions,
		conversation,
		agentPreferences,
		agentModels,
		agentAvailable
	}: {
		shell: ShellContext;
		sessions: readonly Conversation[];
		conversation?: Conversation;
		agentPreferences: AgentPreferences;
		agentModels: readonly AgentModel[];
		agentAvailable: boolean;
	} = $props();

	const note = $derived(shell.noteTree.find((entry) => entry.id === conversation?.contextNoteId));
	const project = $derived(
		shell.projects.find((entry) => entry.id === (conversation?.contextProjectId ?? note?.projectId))
	);
</script>

<main class="flex h-full min-h-dvh flex-col bg-background md:min-h-0">
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
		<div class="ml-auto">
			<AgentSettingsPopover {agentModels} />
		</div>
	</header>
	<div class="mx-auto min-h-0 w-full max-w-4xl flex-1 px-4 py-4 md:px-8">
		<ChatPanel
			{shell}
			{sessions}
			{agentPreferences}
			{agentAvailable}
			initialConversationId={conversation?.id ?? null}
			activeNoteId={conversation?.contextNoteId}
			activeProjectId={conversation?.contextProjectId ?? note?.projectId}
			showHistory={false}
		/>
	</div>
</main>
