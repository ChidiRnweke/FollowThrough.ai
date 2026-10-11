<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { ChatWorkspace } from '$lib/components/chat';
	import { WorkspacePanes } from '$lib/components/shell';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	let { data } = $props();
	const conversation = $derived(workspaceViews.conversation(data.conversationId));
</script>

<!--
	`/chats/*` is a workbench host as well as a page. With `?focus=chat:` in the
	URL the chat is a focused tab and the pane host renders it (possibly beside a
	note); without it this is the plain full-page chat it has always been.
-->
{#if workbench.isWorkbenchPath}
	<WorkspacePanes
		shell={workspaceViews.currentShell}
		sessions={workspaceViews.chatSessions}
		agentPreferences={data.session.preferences}
		agentModels={data.session.agentModels}
		agentDefaults={data.session.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else if conversation}
	<ChatWorkspace
		shell={workspaceViews.currentShell}
		sessions={workspaceViews.chatSessions}
		{conversation}
		agentPreferences={data.session.preferences}
		agentModels={data.session.agentModels}
		agentDefaults={data.session.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else}<p role="status">This chat is no longer available.</p>
{/if}
