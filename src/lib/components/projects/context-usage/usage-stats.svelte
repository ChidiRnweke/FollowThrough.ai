<script lang="ts">
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import * as Card from '$lib/components/ui/card';

	let { summary }: { summary: ProjectContextUsageSummary } = $props();

	const used = $derived(summary.coverage.reduce((sum, kind) => sum + kind.used, 0));
	const total = $derived(summary.coverage.reduce((sum, kind) => sum + kind.total, 0));

	/**
	 * Four numbers a reader can act on without knowing how the agent works. Each says what it
	 * counts in a sentence, because a bare number with a two-word label is a riddle.
	 */
	const tiles = $derived([
		{
			label: 'Chats',
			value: String(summary.chats.length),
			detail: summary.chats.length === 1 ? 'chat used this project' : 'chats used this project',
			alert: false
		},
		{
			label: 'Content used',
			value: total === 0 ? '—' : `${Math.round((used / total) * 100)}%`,
			detail:
				total === 0
					? 'add notes, files or memory to get started'
					: `of your notes, files and memory (${used} of ${total}) has been looked up`,
			alert: false
		},
		{
			label: "Files it can't read",
			value: String(summary.hiddenAttachments.length),
			detail:
				summary.hiddenAttachments.length > 0
					? 'fix these so the agent can find them'
					: 'every file can be searched',
			alert: summary.hiddenAttachments.length > 0
		},
		{
			label: 'Searches with no answer',
			value: String(summary.missedSearches.length),
			detail: "things it looked for here and didn't find",
			alert: false
		}
	]);
</script>

<ul class="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="At a glance">
	{#each tiles as tile (tile.label)}
		<li>
			<Card.Root class="h-full gap-1 px-4 py-3">
				<span class="text-label text-muted-foreground">{tile.label}</span>
				<span
					class="text-2xl font-semibold tabular-nums {tile.alert
						? 'text-destructive'
						: 'text-foreground'}">{tile.value}</span
				>
				<span class="text-label text-muted-foreground">{tile.detail}</span>
			</Card.Root>
		</li>
	{/each}
</ul>
