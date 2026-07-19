<script lang="ts">
	import type { DiagramSuggestion, SuggestionId, SuggestionView } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { suggestionTrayRegistry } from '$lib/stores/registries/suggestion-tray-registry.svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import SuggestionCard from '../suggestion-card.svelte';

	// The right-panel suggestions list always reflects the focused pane.
	// If no pane is currently mounted (panel opened during a brief navigation
	// window) we render the empty state; once the pane mounts this effect
	// re-runs with the live tray.
	const tray = $derived(
		workbench.focusedNoteId ? suggestionTrayRegistry.peek(workbench.focusedNoteId) : undefined
	);

	async function decide(id: SuggestionId, decision: 'accept' | 'reject'): Promise<void> {
		const ok = tray ? await tray.decide(id, decision) : false;
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}

	function isDrawio(view: SuggestionView): boolean {
		return view.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio';
	}
</script>

{#if !tray || tray.items.length === 0}
	<p class="text-sm text-muted-foreground">No pending suggestions for this note.</p>
{:else}
	<div class="flex flex-col gap-3">
		{#each tray.items as view (view.suggestion.id)}
			<SuggestionCard
				{view}
				busy={tray.busyIds.includes(view.suggestion.id)}
				onaccept={isDrawio(view) ? undefined : (id) => void decide(id, 'accept')}
				onreject={(id) => void decide(id, 'reject')}
				onreview={isDrawio(view) && view.suggestion.kind === 'diagram'
					? () => tray.requestReview(view.suggestion as DiagramSuggestion)
					: undefined}
			/>
		{/each}
	</div>
{/if}
