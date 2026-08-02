<script lang="ts">
	import type { PageData } from './$types';
	import { WorkspacePanes } from '$lib/components/shell';

	let { data }: { data: PageData } = $props();
</script>

<WorkspacePanes
	shell={data.shell}
	focusedInitialView={data.focusedNoteView}
	inlineSuggestionsEnabled={data.agentPreferences.inlineSuggestionsEnabled}
/>
