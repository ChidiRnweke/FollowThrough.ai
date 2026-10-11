<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import type { PageData } from './$types';
	import { WorkspacePanes } from '$lib/components/shell';

	let { data }: { data: PageData } = $props();
</script>

<!--
	The workbench host for a focused search tab, mirroring `/notes/[id]`. The
	URL carries the tab state (`/search?tabs=…&focus=search`); every pane,
	search included, renders through the same kind-agnostic host.
-->
<WorkspacePanes
	shell={workspaceViews.currentShell}
	sessions={workspaceViews.chatSessions}
	agentPreferences={data.session.preferences}
	agentModels={data.session.agentModels}
	agentDefaults={data.session.agentDefaults}
	agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
/>
