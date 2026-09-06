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
		shell={data.shell}
		sessions={data.sessions}
		agentPreferences={data.agentPreferences}
		agentModels={data.agentModels}
		agentDefaults={data.agentDefaults}
		agentAvailable={data.agentAvailable}
	/>
{:else}
	<ChatWorkspace
		shell={data.shell}
		sessions={data.sessions}
		agentPreferences={data.agentPreferences}
		agentModels={data.agentModels}
		agentDefaults={data.agentDefaults}
		agentAvailable={data.agentAvailable}
	/>
{/if}
