<script lang="ts">
	import { ChatWorkspace } from '$lib/components/chat';
	import { WorkspacePanes } from '$lib/components/shell';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	let { data } = $props();
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
		agentDefaults={data.session.bootstrap.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else}
	<ChatWorkspace
		shell={data.session.shell}
		sessions={data.session.sessions}
		agentPreferences={data.session.preferences}
		agentModels={data.session.bootstrap.agentModels}
		agentDefaults={data.session.bootstrap.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{/if}
