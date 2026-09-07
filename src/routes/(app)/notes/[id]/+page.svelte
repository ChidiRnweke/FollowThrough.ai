<script lang="ts">
	import type { PageData } from './$types';
	import { WorkspacePanes } from '$lib/components/shell';

	let { data }: { data: PageData } = $props();
</script>

<WorkspacePanes
	shell={data.session.shell}
	sessions={data.session.sessions}
	agentPreferences={data.session.preferences}
	agentModels={data.session.bootstrap.agentModels}
	agentDefaults={data.session.bootstrap.agentDefaults}
	agentAvailable={data.session.bootstrap.agentAvailable && data.session.resources.online}
	inlineSuggestionsEnabled={data.session.preferences.inlineSuggestionsEnabled}
/>
