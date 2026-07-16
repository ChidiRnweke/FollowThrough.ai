<script lang="ts">
	import MemoryEntryList from '../memory-entry-list.svelte';
</script>

<div class="max-w-2xl">
	<MemoryEntryList
		placeholder="Something about you the agent should always know — your role, goals, how you like to work…"
		emptyText="Nothing here yet. Tell the agent about yourself in chat, or add what it should always know about you."
	/>
</div>
