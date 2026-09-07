<script lang="ts">
	import { ChatWorkspace } from '$lib/components/chat';
	import { WorkspacePanes } from '$lib/components/shell';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	let { data } = $props();
	const conversation = $derived(data.session.resources.views.conversation(data.conversationId));
</script>

<!--
	`/chats/*` is a workbench host as well as a page. With `?focus=chat:` in the
	URL the chat is a focused tab and the pane host renders it (possibly beside a
	note); without it this is the plain full-page chat it has always been.
-->
{#if workbench.isWorkbenchPath}
	<WorkspacePanes
		shell={data.session.shell}
		sessions={data.session.sessions}
		agentPreferences={data.session.preferences}
		agentModels={data.session.bootstrap.agentModels}
		agentDefaults={data.session.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else if conversation}
	<ChatWorkspace
		shell={data.session.shell}
		sessions={data.session.sessions}
		{conversation}
		agentPreferences={data.session.preferences}
		agentModels={data.session.bootstrap.agentModels}
		agentDefaults={data.session.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else}<p role="status">This chat is no longer available.</p>
{/if}
