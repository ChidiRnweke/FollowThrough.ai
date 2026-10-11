<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { UsageRow } from '$lib/models/context-usage';
	import * as Chart from '$lib/components/ui/chart';

	let { mostUsed }: { mostUsed: readonly UsageRow[] } = $props();

	/**
	 * The chart shows the top of the ranking at a glance; the full ranking is the table below
	 * it, so this is a choice about what fits a chart, not a limit on what is read.
	 */
	const shown = 8;
	const series: readonly Chart.ChartSeries[] = [{ key: 'uses', label: 'Times read' }];
	const shorten = (title: string) => (title.length > 22 ? `${title.slice(0, 21)}…` : title);
	const rows = $derived(
		mostUsed.slice(0, shown).map((row) => ({ name: shorten(row.item.title), uses: row.uses }))
	);
</script>

<figure class="flex min-w-0 flex-col gap-row">
	<figcaption class="flex flex-col gap-bind">
		<span class="section-title">What the agent reads most</span>
		<span class="text-sm text-muted-foreground"
			>The notes, files and memory it went back to most often.</span
		>
	</figcaption>
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">The agent hasn't read anything here yet.</p>
	{:else}
		<Chart.Container config={Chart.chartConfigOf(series)} class="aspect-auto h-56 w-full">
			<BarChart
				data={rows}
				y="name"
				orientation="horizontal"
				series={Chart.layerSeriesOf(series)}
				padding={{ left: 148, right: 12, top: 4, bottom: 24 }}
				props={{ bars: { radius: 2, strokeWidth: 0 }, xAxis: { format: Chart.countTick } }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	{/if}
</figure>
