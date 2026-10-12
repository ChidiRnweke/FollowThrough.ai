<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { WeeklyReads } from '$lib/models/context-usage';
	import * as Chart from '$lib/components/ui/chart';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { kindNoun } from './kinds';
	import { readKinds, weekTotal, weeklyConclusion } from './weekly';

	let { activity }: { activity: readonly WeeklyReads[] } = $props();

	/**
	 * One series by default: how much. The current week is the brand teal and earlier weeks the
	 * lighter step, so "now" stands out inside one series. By kind is a mode, not the default: a
	 * stack asks the reader to compare shades, so it is offered only when the question is "of what".
	 */
	let mode = $state<'all' | 'kind'>('all');

	const allSeries: readonly Chart.ChartSeries[] = [
		{ key: 'earlier', label: 'Times read', color: 'var(--chart-2)' },
		{ key: 'current', label: 'This week' }
	];
	const kindSeries: readonly Chart.ChartSeries[] = readKinds.map((kind) => ({
		key: kind,
		label: kindNoun[kind][1]
	}));
	const series = $derived(mode === 'all' ? allSeries : kindSeries);

	const weekLabel = new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const rows = $derived(
		activity.map((week, index) => {
			const total = weekTotal(week);
			const current = index === activity.length - 1;
			return {
				week: weekLabel.format(new Date(week.weekStart)),
				earlier: current ? 0 : total,
				current: current ? total : 0,
				note: week.note,
				attachment: week.attachment,
				memory: week.memory,
				skill: week.skill
			};
		})
	);

	/**
	 * At most six week labels, counted back from this week, so they never overlap at phone width;
	 * every bar keeps its tooltip.
	 */
	const labelled = $derived.by(() => {
		const step = Math.ceil(rows.length / 6);
		return rows.filter((_, index) => (rows.length - 1 - index) % step === 0).map((row) => row.week);
	});

	const conclusion = $derived(weeklyConclusion(activity));
	const reads = (count: number) => `${count} ${count === 1 ? 'read' : 'reads'}`;
	const trend = (thisWeek: number, lastWeek: number) =>
		thisWeek === lastWeek
			? 'the same as last week'
			: `${thisWeek > lastWeek ? 'up' : 'down'} ${Math.abs(thisWeek - lastWeek)} from last week`;
</script>

<figure class="flex min-w-0 flex-col gap-row">
	<figcaption class="flex items-start justify-between gap-group">
		<span class="flex min-w-0 flex-col gap-bind">
			<span class="section-title">What the agent read each week</span>
			<span class="text-sm text-muted-foreground">
				One read is one time a chat opened, searched or quoted a note, file, memory entry or skill.
				One item in one call counts once.
			</span>
		</span>
		{#if conclusion}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				value={mode}
				onValueChange={(value) => (mode = value === 'kind' ? 'kind' : 'all')}
				aria-label="Show reads"
				class="shrink-0"
			>
				<ToggleGroup.Item value="all">All</ToggleGroup.Item>
				<ToggleGroup.Item value="kind">By kind</ToggleGroup.Item>
			</ToggleGroup.Root>
		{/if}
	</figcaption>
	{#if !conclusion}
		<p class="text-sm text-muted-foreground">
			The agent hasn't read anything here yet. Ask about this project in a chat.
		</p>
	{:else}
		{#key mode}
			<Chart.Container config={Chart.chartConfigOf(series)} class="aspect-auto h-56 w-full">
				<BarChart
					data={rows}
					x="week"
					bandPadding={0.4}
					series={Chart.layerSeriesOf(series)}
					seriesLayout="stack"
					legend={mode === 'kind'}
					padding={{ left: 32, right: 8, top: 8, bottom: mode === 'kind' ? 52 : 24 }}
					props={{
						bars: { radius: 2, strokeWidth: 0 },
						xAxis: { ticks: labelled },
						yAxis: { format: Chart.countTick }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip />
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/key}
		<p class="text-xs text-muted-foreground">
			Busiest week: {weekLabel.format(new Date(conclusion.busiest.weekStart))} ({reads(
				conclusion.busiest.reads
			)}). This week: {conclusion.thisWeek}{#if conclusion.lastWeek !== undefined},
				{trend(conclusion.thisWeek, conclusion.lastWeek)}{/if}. {kindNoun[conclusion.lead.kind][1]}
			are {conclusion.lead.percent}% of all reads.
		</p>
	{/if}
</figure>
