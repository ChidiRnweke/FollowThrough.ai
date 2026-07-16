<script lang="ts">
	import MemoryEntryList from '../memory-entry-list.svelte';
</script>

<section class="space-y-3">
	<h2 class="text-sm font-semibold">About you</h2>
	<p class="text-sm text-muted-foreground">
		What the agent knows about you across every project — who you are, what you're working
		toward, and how you like to work. The agent proposes additions as it gets to know you; you
		decide what sticks.
	</p>
	<div class="max-w-2xl">
		<MemoryEntryList
			placeholder="Something about you the agent should always know — your role, goals, how you like to work…"
			emptyText="Nothing here yet. Tell the agent about yourself in chat, or add what it should always know about you."
		/>
	</div>
</section>
