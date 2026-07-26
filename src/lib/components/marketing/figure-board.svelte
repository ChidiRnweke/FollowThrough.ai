<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import Surface from './surface.svelte';

	// The board, so the page shows commitments in motion and not only the moment
	// they were captured. Every card carries the note it was opened from — that
	// provenance line is the point of the section: nobody typed these in.
	const columns = [
		{
			name: 'Open',
			cards: [
				{
					title: 'Send the client brief to marketing',
					due: 'Fri 31 Jul',
					tone: 'due',
					from: 'Client brief standup'
				},
				{
					title: 'Find an owner for the deck',
					due: undefined,
					tone: 'plain',
					from: 'Client brief standup'
				}
			]
		},
		{
			name: 'In progress',
			cards: [
				{
					title: 'Rewrite the positioning section',
					due: 'Mon 3 Aug',
					tone: 'plain',
					from: 'Positioning research'
				}
			]
		},
		{
			name: 'Waiting on',
			cards: [
				{
					title: 'Legal sign-off on the examples',
					due: 'Overdue · 24 Jul',
					tone: 'overdue',
					from: 'Release process'
				}
			]
		}
	] as const;
</script>

<Surface label="Acme rebrand · board">
	<div class="grid gap-px bg-border sm:grid-cols-3">
		{#each columns as column (column.name)}
			<div class="flex min-w-0 flex-col gap-3 bg-card px-4 py-4">
				<div class="flex items-baseline justify-between">
					<span class="eyebrow">{column.name}</span>
					<span class="provenance-caption">{column.cards.length}</span>
				</div>
				{#each column.cards as card (card.title)}
					<div class="flex flex-col gap-2 rounded-xl px-3 py-3 ring-1 ring-foreground/10">
						<span class="text-sm leading-snug font-medium">{card.title}</span>
						<div class="flex flex-wrap items-center gap-1.5">
							<Badge variant="brand">Acme</Badge>
							{#if card.due}
								<span
									class="provenance-caption {card.tone === 'overdue'
										? 'font-medium text-destructive'
										: ''}">{card.due}</span
								>
							{/if}
						</div>
						<div class="flex items-center gap-1.5">
							<span class="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
							<span class="provenance-caption min-w-0 truncate">from {card.from}</span>
						</div>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</Surface>
