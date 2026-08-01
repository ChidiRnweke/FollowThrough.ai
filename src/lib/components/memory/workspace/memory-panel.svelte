<script lang="ts">
	import MemoryEntryList from '../memory-entry-list.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';

	const projectId = $derived(rightPanel.memoryProjectId);
</script>

{#if projectId}
	{#key projectId}
		<MemoryEntryList
			{projectId}
			placeholder="A fact, decision, constraint, or preference worth remembering…"
			emptyText="Nothing remembered yet. Add durable project facts here, or accept memory suggestions from the agent."
		/>
	{/key}
{:else}
	<p class="text-sm text-muted-foreground">Open a project to see its memory.</p>
{/if}
