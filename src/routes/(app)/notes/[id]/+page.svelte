<script lang="ts">
	import type { PageData } from './$types';
	import { WorkspacePanes } from '$lib/components/shell';

	let { data }: { data: PageData } = $props();
</script>

<WorkspacePanes
	shell={data.shell}
	sessions={data.sessions}
	agentPreferences={data.agentPreferences}
	agentModels={data.agentModels}
	agentDefaults={data.agentDefaults}
	agentAvailable={data.agentAvailable}
	focusedInitialView={data.focusedNoteView}
	inlineSuggestionsEnabled={data.agentPreferences.inlineSuggestionsEnabled}
/>
