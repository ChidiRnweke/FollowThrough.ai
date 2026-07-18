<script lang="ts">
	import type { DiagramSuggestion, SuggestionId } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import {
		formatDate,
		provenanceCaption,
		relationshipLabels,
		suggestionKindLabels
	} from './labels';

	let { suggestionId }: { suggestionId: SuggestionId } = $props();

	const view = $derived(suggestionTray.items.find((item) => item.suggestion.id === suggestionId));
	const busy = $derived(suggestionTray.busyIds.includes(suggestionId));
	const isDrawio = $derived(
		view?.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio'
	);

	async function decide(decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionTray.decide(suggestionId, decision);
		if (!ok) toast.error('Could not apply the decision. Try again.');
	}

	function openReview(): void {
		if (view?.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio') {
			suggestionTray.requestReview(view.suggestion as DiagramSuggestion);
		}
	}
</script>

{#if view}
	{@const suggestion = view.suggestion}
	<div class="suggestion-inline-widget suggestion-inline-widget--{suggestion.kind}">
		<div class="flex items-start gap-2">
			<span class="suggestion-inline-widget__glyph select-none" aria-hidden="true">+</span>
			<div class="min-w-0 flex-1 space-y-0.5">
				{#if suggestion.kind === 'todo'}
					<p class="text-sm">
						<span class="font-medium">{suggestionKindLabels[suggestion.kind]}:</span>
						{suggestion.payload.title}
					</p>
					<p class="text-xs text-muted-foreground">
						{suggestion.payload.responsibility === 'waiting_on' ? 'Waiting on someone' : 'Mine'}
						{#if suggestion.payload.dueDate}
							· due {formatDate(suggestion.payload.dueDate)}
						{/if}
					</p>
				{:else if suggestion.kind === 'backlink'}
					<p class="text-sm">
						<span class="font-medium">{suggestionKindLabels[suggestion.kind]}:</span>
						{relationshipLabels[suggestion.payload.kind]}
					</p>
					{#if suggestion.payload.justification}
						<p class="text-xs text-muted-foreground">{suggestion.payload.justification}</p>
					{/if}
				{:else}
					<p class="text-sm">{suggestionKindLabels[suggestion.kind]}</p>
				{/if}
				<p class="provenance-caption">
					{provenanceCaption(view.provenance, view.note?.title)}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				{#if isDrawio}
					<Button size="sm" variant="outline" disabled={busy} onclick={openReview}>Review</Button>
				{:else}
					<Button size="sm" disabled={busy} onclick={() => void decide('accept')}>Accept</Button>
				{/if}
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => void decide('reject')}>
					Dismiss
				</Button>
			</div>
		</div>
	</div>
{/if}
