<script lang="ts">
	import { WidgetPane } from '$lib/components/widgets';
	import { WorkspacePanes } from '$lib/components/shell';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

	let { data } = $props();
</script>

<!--
	`/widgets/[id]` is a workbench host as well as a page, as `/diagrams/[id]` is. With
	`?focus=widget:` the widget is a focused tab beside whatever else is open; without it, a shared
	link shows the widget on its own.
-->
{#if workbench.isWorkbenchPath}
	<WorkspacePanes
		shell={data.session.shell}
		sessions={data.session.sessions}
		agentPreferences={data.session.preferences}
		agentModels={data.session.agentModels}
		agentDefaults={data.session.agentDefaults}
		agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	/>
{:else}
	<div class="flex min-h-0 flex-1 flex-col">
		<WidgetPane widgetId={data.widgetId} />
	</div>
{/if}
