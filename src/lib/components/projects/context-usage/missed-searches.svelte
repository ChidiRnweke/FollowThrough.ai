<script lang="ts">
	import { BarChart } from 'layerchart';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { MissedSearch } from '$lib/models/context-usage';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import * as Chart from '$lib/components/ui/chart';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';

	let { searches, projectId }: { searches: readonly MissedSearch[]; projectId: ProjectId } =
		$props();

	const series: readonly Chart.ChartSeries[] = [
		{ key: 'times', label: 'Times asked', color: 'var(--warning)' }
	];
	const shorten = (query: string) => (query.length > 26 ? `${query.slice(0, 25)}…` : query);
	const rows = $derived(
		searches.map((search) => ({ query: shorten(search.query), times: search.times }))
	);
	/**
	 * Room per bar, so a long list of gaps grows the chart instead of squeezing every bar thin.
	 * Stepped classes rather than a computed height: inline styles are banned here.
	 */
	const height = $derived(
		rows.length <= 2 ? 'h-28' : rows.length <= 4 ? 'h-44' : rows.length <= 7 ? 'h-64' : 'h-96'
	);

	let writing = $state<string | null>(null);

	/** A gap is fixed by the note that fills it, so the action starts that note. */
	async function writeNote(query: string): Promise<void> {
		writing = query;
		const id = crypto.randomUUID() as NoteId;
		const created = await workspaceSession
			.create({ kind: 'createNote', id, projectId, title: query })
			.finally(() => (writing = null));
		if (created.kind === 'failure') {
			toast.error('Could not create the note. Try again.');
			return;
		}
		await goto(`/notes/${id}`);
	}
</script>

<section class="flex flex-col gap-4" aria-labelledby="missed-heading">
	<header class="flex items-baseline gap-3">
		<span class="text-4xl font-semibold tracking-tight text-warning tabular-nums"
			>{searches.length}</span
		>
		<div class="flex flex-col">
			<h2 id="missed-heading" class="text-base font-medium">
				{searches.length === 1 ? 'Search' : 'Searches'} with no answer
			</h2>
			<p class="text-sm text-muted-foreground">
				The agent looked for these and this project had nothing. Longer bars were asked more often.
			</p>
		</div>
	</header>

	<Chart.Container config={Chart.chartConfigOf(series)} class={['aspect-auto w-full', height]}>
		<BarChart
			data={rows}
			y="query"
			orientation="horizontal"
			series={Chart.layerSeriesOf(series)}
			padding={{ left: 176, right: 12, top: 4, bottom: 24 }}
			props={{ bars: { radius: 3, strokeWidth: 0 }, xAxis: { format: Chart.countTick } }}
		>
			{#snippet tooltip()}
				<Chart.Tooltip />
			{/snippet}
		</BarChart>
	</Chart.Container>

	<ul class="divide-y divide-border">
		{#each searches as search (search.query)}
			<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
				<Icon.Search class="size-4 shrink-0 text-warning" />
				<span class="min-w-0 flex-1 truncate font-medium" title={search.query}>{search.query}</span>
				<span class="text-xs text-muted-foreground"
					>{search.times > 1 ? `${search.times} times · ` : ''}{formatRelativeTime(
						search.lastAt
					)}</span
				>
				<div class="flex gap-1.5">
					<Button
						size="sm"
						variant="outline"
						disabled={writing !== null}
						onclick={() => writeNote(search.query)}
					>
						<Icon.DocumentPlus class="size-4" /> Write a note
					</Button>
					<Button size="sm" variant="ghost" href="/chats/{search.conversationId}">
						<Icon.Chat class="size-4" /> See the chat
					</Button>
				</div>
			</li>
		{/each}
	</ul>
</section>
