<script lang="ts">
	import type { SuggestionId, SuggestionView } from '$lib/models/suggestions';
	import { toast } from 'svelte-sonner';
	import { suggestionActions } from '$lib/stores/suggestions/actions.svelte';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import SuggestionCard from '../suggestion-card.svelte';

	const projection = $derived(
		workbench.focusedNoteId
			? workspaceSession.current?.resources.views.note(workbench.focusedNoteId)
			: undefined
	);
	const items = $derived(projection?.view.pendingSuggestions ?? []);

	async function decide(id: SuggestionId, decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionActions.decide(id, decision);
		if (ok) toast.success(decision === 'accept' ? 'Accepted' : 'Dismissed');
		else toast.error('That did not go through. Try again.');
	}

	function isDrawio(view: SuggestionView): boolean {
		return view.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio';
	}
</script>

{#if !workbench.focusedNoteId}
	<p class="text-sm text-muted-foreground">Open a note to review its suggestions.</p>
{:else if !projection}
	<p class="text-sm text-muted-foreground">This note is not available on this device.</p>
{:else if items.length === 0 && projection.missing.length > 0}
	<p class="text-sm text-muted-foreground">
		Some suggestion details are not available on this device yet.
	</p>
{:else if items.length === 0}
	<p class="text-sm text-muted-foreground">No pending suggestions for this note.</p>
{:else}
	<div class="flex flex-col gap-3">
		{#each items as view (view.suggestion.id)}
			<SuggestionCard
				{view}
				busy={suggestionActions.busyIds.includes(view.suggestion.id)}
				onaccept={isDrawio(view) ? undefined : (id) => void decide(id, 'accept')}
				onreject={(id) => void decide(id, 'reject')}
				onreview={isDrawio(view) && view.suggestion.kind === 'diagram'
					? () => suggestionActions.requestReview(view.suggestion.id)
					: undefined}
			/>
		{/each}
	</div>
{/if}
