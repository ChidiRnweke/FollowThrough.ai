<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import SuggestionCard from '../suggestion-card.svelte';

	async function decide(
		id: (typeof suggestionTray.items)[number]['suggestion']['id'],
		decision: 'accept' | 'reject'
	) {
		const ok = await suggestionTray.decide(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}
</script>

<div class="flex flex-col gap-3">
	{#if suggestionTray.items.length === 0}
		<p class="text-sm text-muted-foreground">
			No pending suggestions here. Select text in a note and run Extract Promises, Relate or
			Reference to create some.
		</p>
	{:else}
		{#each suggestionTray.items as view (view.suggestion.id)}
			<SuggestionCard
				{view}
				busy={suggestionTray.busyIds.includes(view.suggestion.id)}
				onaccept={(id) => decide(id, 'accept')}
				onreject={(id) => decide(id, 'reject')}
			/>
		{/each}
	{/if}
</div>
