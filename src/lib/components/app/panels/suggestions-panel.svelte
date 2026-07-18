<script lang="ts">
	import type { DiagramSuggestion, SuggestionId } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import SuggestionCard from '../suggestion-card.svelte';

	async function decide(id: SuggestionId, decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionTray.decide(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}

	function isDrawio(view: (typeof suggestionTray.items)[number]): boolean {
		return view.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio';
	}
</script>

{#if suggestionTray.items.length === 0}
	<p class="text-sm text-muted-foreground">No pending suggestions for this note.</p>
{:else}
	<div class="flex flex-col gap-3">
		{#each suggestionTray.items as view (view.suggestion.id)}
			<SuggestionCard
				{view}
				busy={suggestionTray.busyIds.includes(view.suggestion.id)}
				onaccept={isDrawio(view) ? undefined : (id) => void decide(id, 'accept')}
				onreject={(id) => void decide(id, 'reject')}
				onreview={isDrawio(view) && view.suggestion.kind === 'diagram'
					? () => suggestionTray.requestReview(view.suggestion as DiagramSuggestion)
					: undefined}
			/>
		{/each}
	</div>
{/if}
