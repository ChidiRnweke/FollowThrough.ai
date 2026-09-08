<script lang="ts">
	import { DiagramPane } from '$lib/components/diagrams';
	import { WorkspacePanes } from '$lib/components/shell';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

	let { data } = $props();
</script>

<!--
	`/diagrams/[id]` is a workbench host as well as a page. With `?focus=diagram:`
	in the URL the diagram is a focused tab and the pane host renders it, normally
	beside its chat; without it — a shared link, or the gallery's Open action — the
	route shows the canvas on its own, exactly as `/chats/[id]` shows a chat.
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
{:else}
	<div class="flex min-h-0 flex-1 flex-col">
		<DiagramPane diagramId={data.diagramId} />
	</div>
{/if}
