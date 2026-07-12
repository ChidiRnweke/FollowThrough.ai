<script lang="ts">
	import type { SuggestionGroup, SuggestionId } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import SuggestionCard from '../suggestion-card.svelte';

	let { groups }: { groups: readonly SuggestionGroup[] } = $props();

	async function decide(id: SuggestionId, decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionTray.decide(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}

	async function acceptGroup(group: SuggestionGroup): Promise<void> {
		for (const view of group.suggestions) {
			await decide(view.suggestion.id, 'accept');
		}
	}
</script>

{#if groups.length === 0}
	<p class="text-sm text-muted-foreground">
		The inbox is clear. New suggestions from any pipeline land here for review.
	</p>
{/if}

{#each groups as group (group.note?.id ?? 'unfiled')}
	<section class="space-y-3">
		<div class="flex items-center justify-between gap-2">
			{#if group.note}
				<a href="/notes/{group.note.id}" class="text-sm font-semibold hover:underline">
					{group.note.title}
				</a>
			{:else}
				<h2 class="text-sm font-semibold text-muted-foreground">Not tied to a note</h2>
			{/if}
			{#if group.suggestions.length > 1}
				<Button variant="ghost" size="sm" onclick={() => void acceptGroup(group)}>
					Accept all
				</Button>
			{/if}
		</div>
		<div class="grid gap-3 lg:grid-cols-2">
			{#each group.suggestions as view (view.suggestion.id)}
				<SuggestionCard
					{view}
					busy={suggestionTray.busyIds.includes(view.suggestion.id)}
					onaccept={(id) => void decide(id, 'accept')}
					onreject={(id) => void decide(id, 'reject')}
				/>
			{/each}
		</div>
	</section>
{/each}
