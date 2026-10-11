<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { WeeklyLookups } from '$lib/models/context-usage';
	import * as Chart from '$lib/components/ui/chart';
	import { kindNoun } from './kinds';

	let { activity }: { activity: readonly WeeklyLookups[] } = $props();

	const series: readonly Chart.ChartSeries[] = (
		['note', 'attachment', 'memory', 'skill'] as const
	).map((key) => ({ key, label: kindNoun[key][1] }));
	const weekLabel = new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const rows = $derived(
		activity.map((week) => ({ ...week, week: weekLabel.format(new Date(week.weekStart)) }))
	);
</script>

<figure class="flex min-w-0 flex-col gap-2">
	<figcaption class="flex flex-col gap-0.5">
		<span class="text-base font-medium">Lookups over time</span>
		<span class="text-label text-muted-foreground">
			Each bar is one week: how often the agent looked something up in this project.
		</span>
	</figcaption>
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">Nothing yet. Ask about this project in a chat.</p>
	{:else}
		<Chart.Container config={Chart.chartConfigOf(series)} class="aspect-auto h-64 w-full">
			<BarChart
				data={rows}
				x="week"
				bandPadding={0.4}
				series={Chart.layerSeriesOf(series)}
				seriesLayout="stack"
				legend
				padding={{ left: 32, right: 8, top: 8, bottom: 52 }}
				props={{ bars: { radius: 2, strokeWidth: 0 }, yAxis: { format: Chart.countTick } }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	{/if}
</figure>
