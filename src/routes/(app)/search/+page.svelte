<script lang="ts">
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
	shell={data.shell}
	sessions={data.sessions}
	agentPreferences={data.agentPreferences}
	agentModels={data.agentModels}
	agentAvailable={data.agentAvailable}
/>
