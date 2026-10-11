<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import type { PageData } from './$types';
	import { WorkspacePanes } from '$lib/components/shell';

	let { data }: { data: PageData } = $props();
</script>

<WorkspacePanes
	shell={workspaceViews.currentShell}
	sessions={workspaceViews.chatSessions}
	agentPreferences={data.session.preferences}
	agentModels={data.session.agentModels}
	agentDefaults={data.session.agentDefaults}
	agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	inlineSuggestionsEnabled={data.session.preferences.inlineSuggestionsEnabled}
/>
