<script lang="ts">
	import type { DiagramSuggestion } from '$lib/models/diagrams';
	import type { SuggestionId } from '$lib/models/suggestions';
	import type { NodeViewProps } from '@tiptap/core';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import {
		formatDate,
		provenanceCaption,
		relationshipLabels,
		suggestionKindLabels
	} from '../shared/labels';

	let { suggestionId, editor }: { suggestionId: SuggestionId; editor: NodeViewProps['editor'] } =
		$props();

	// See `todo-node.svelte` for the cast rationale: TipTap's NodeViewProps
	// types `editor` as the base TiptapEditor; our `perNote` slot lives on
	// the subclass in `CoreEditor.ts`.
	const perNote = $derived((editor as unknown as { perNote?: PerNoteEditorSlot }).perNote);
	const view = $derived(
		perNote?.suggestions.items.find((item) => item.suggestion.id === suggestionId)
	);
	const busy = $derived(perNote?.suggestions.busyIds.includes(suggestionId) ?? false);
	const isDrawio = $derived(
		view?.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio'
	);

	async function decide(decision: 'accept' | 'reject'): Promise<void> {
		if (!perNote) return;
		const ok = await perNote.suggestions.decide(suggestionId, decision);
		if (!ok) toast.error('Could not apply the decision. Try again.');
	}

	function openReview(): void {
		if (view?.suggestion.kind === 'diagram' && view.suggestion.payload.kind === 'drawio') {
			perNote?.suggestions.requestReview(view.suggestion as DiagramSuggestion);
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
