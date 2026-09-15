<script lang="ts">
	import type { SuggestionView } from '$lib/models/suggestions';
	import {
		suggestionUndoAvailability,
		revertSuggestion
	} from '$lib/remote/suggestions/suggestions.remote';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { toast } from 'svelte-sonner';
	import SuggestionCard from '../suggestion-card.svelte';
	let { view }: { view: SuggestionView } = $props();
	let busy = $state(false);
	const availability = $derived(suggestionUndoAvailability({ suggestionId: view.suggestion.id }));
	async function undo(): Promise<{ kind: 'success' } | { kind: 'failure' }> {
		busy = true;
		try {
			await revertSuggestion({ suggestionId: view.suggestion.id });
			await workspaceSession.synchronize();
			toast.success('Suggestion undone');
			return { kind: 'success' };
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Undo failed. Try again.');
			return { kind: 'failure' };
		} finally {
			busy = false;
		}
	}
</script>

{#await availability}
	<SuggestionCard {view} />
	<p class="text-sm text-muted-foreground">Checking whether this suggestion can be undone…</p>
{:then result}
	<SuggestionCard {view} {busy} undo={{ availability: result, onundo: () => void undo() }} />
{:catch}
	<SuggestionCard {view} />
	<p class="text-sm text-muted-foreground">
		Connect to check whether this suggestion can be undone.
	</p>
{/await}
