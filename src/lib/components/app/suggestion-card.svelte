<script lang="ts">
	import type { SuggestionId, SuggestionView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		formatDate,
		provenanceCaption,
		referenceTierLabels,
		relationshipLabels,
		suggestionKindLabels
	} from './labels';

	let {
		view,
		busy = false,
		onaccept,
		onreject
	}: {
		view: SuggestionView;
		busy?: boolean;
		onaccept?: (suggestionId: SuggestionId) => void;
		onreject?: (suggestionId: SuggestionId) => void;
	} = $props();

	const suggestion = $derived(view.suggestion);
	const strength = $derived(
		suggestion.kind === 'todo' ? suggestion.payload.promiseStrength : undefined
	);
	const memoryOperationLabels = { add: 'Add', update: 'Update', remove: 'Remove' } as const;
</script>

<Card.Root class="gap-2 py-3">
	<Card.Header class="px-4">
		<Card.Title class="flex items-center gap-2 text-sm font-medium">
			{suggestionKindLabels[suggestion.kind]}
			{#if strength && strength !== 'explicit'}
				<Badge variant="ghost" class="text-muted-foreground">{strength}</Badge>
			{/if}
		</Card.Title>
		{#if suggestion.isAutoAccepted}
			<Card.Action>
				<Badge variant="ghost" class="text-muted-foreground">Auto-accepted</Badge>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-1.5 px-4">
		{#if suggestion.kind === 'todo'}
			<p class="text-sm">{suggestion.payload.title}</p>
			<p class="text-sm text-muted-foreground">
				{suggestion.payload.responsibility === 'waiting_on' ? 'Waiting on someone' : 'Mine'}
				{#if suggestion.payload.dueDate}
					· due {formatDate(suggestion.payload.dueDate)}
				{/if}
				{#if suggestion.payload.dueDateVerbatim}
					· “{suggestion.payload.dueDateVerbatim}”
				{/if}
			</p>
		{:else if suggestion.kind === 'backlink'}
			<p class="text-sm">
				<span
					class={suggestion.payload.kind === 'contradicts'
						? 'font-medium text-warning'
						: 'font-medium'}
				>
					{relationshipLabels[suggestion.payload.kind]}
				</span>
			</p>
			{#if suggestion.payload.justification}
				<p class="text-sm text-muted-foreground">{suggestion.payload.justification}</p>
			{/if}
		{:else if suggestion.kind === 'reference'}
			<p class="text-sm">
				{suggestion.payload.title}
				<Badge variant="ghost" class="ml-1 text-muted-foreground">
					{referenceTierLabels[suggestion.payload.tier]}
				</Badge>
			</p>
			<p class="text-sm text-muted-foreground">{suggestion.payload.relevanceNote}</p>
		{:else if suggestion.kind === 'diagram'}
			<p class="text-sm">{suggestion.payload.title ?? 'Untitled diagram'}</p>
			<pre class="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{suggestion.payload
					.source}</pre>
		{:else if suggestion.kind === 'memory'}
			<p class="text-sm">
				<Badge variant="ghost" class="mr-1 text-muted-foreground">
					{memoryOperationLabels[suggestion.payload.operation]}
				</Badge>
				{#if suggestion.payload.content}
					{suggestion.payload.content}
				{/if}
			</p>
			{#if suggestion.payload.justification}
				<p class="text-sm text-muted-foreground">{suggestion.payload.justification}</p>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">Proposed content insertion</p>
		{/if}
		{#if view.anchor}
			<blockquote class="border-l-2 border-border pl-2 text-xs text-muted-foreground">
				{view.anchor.quote}
			</blockquote>
		{/if}
		<p class="provenance-caption">
			{provenanceCaption(view.provenance, view.note?.title)}
		</p>
	</Card.Content>
	{#if suggestion.status === 'proposed' && (onaccept || onreject)}
		<Card.Footer class="gap-2 px-4">
			{#if onaccept}
				<Button size="sm" disabled={busy} onclick={() => onaccept(suggestion.id)}>Accept</Button>
			{/if}
			{#if onreject}
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => onreject(suggestion.id)}>
					Dismiss
				</Button>
			{/if}
		</Card.Footer>
	{/if}
</Card.Root>
