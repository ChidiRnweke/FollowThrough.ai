<script lang="ts">
	import type { SuggestionId } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import {
		formatDate,
		provenanceCaption,
		referenceTierLabels,
		relationshipLabels,
		suggestionKindLabels
	} from './labels';

	let { suggestionId }: { suggestionId: SuggestionId } = $props();

	const view = $derived(suggestionTray.items.find((item) => item.suggestion.id === suggestionId));
	const busy = $derived(suggestionTray.busyIds.includes(suggestionId));

	async function decide(decision: 'accept' | 'reject'): Promise<void> {
		const ok = await suggestionTray.decide(suggestionId, decision);
		if (!ok) toast.error('Could not apply the decision. Try again.');
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
				{:else if suggestion.kind === 'reference'}
					<p class="text-sm">
						<span class="font-medium">{suggestionKindLabels[suggestion.kind]}:</span>
						{suggestion.payload.title}
						<span class="text-muted-foreground"
							>({referenceTierLabels[suggestion.payload.tier]})</span
						>
					</p>
					<p class="text-xs text-muted-foreground">{suggestion.payload.relevanceNote}</p>
				{:else}
					<p class="text-sm">{suggestionKindLabels[suggestion.kind]}</p>
				{/if}
				<p class="provenance-caption">
					{provenanceCaption(view.provenance, view.note?.title)}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<Button size="sm" disabled={busy} onclick={() => void decide('accept')}>Accept</Button>
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => void decide('reject')}>
					Dismiss
				</Button>
			</div>
		</div>
	</div>
{/if}
