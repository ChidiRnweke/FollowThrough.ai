<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { WeeklyReads } from '$lib/models/context-usage';
	import * as Chart from '$lib/components/ui/chart';

	let { activity }: { activity: readonly WeeklyReads[] } = $props();

	/**
	 * One series: how much, not what. Which kinds it read is the coverage chart's question, and a
	 * stack of four shades of one hue asked the reader to tell them apart for no gain.
	 */
	const series: readonly Chart.ChartSeries[] = [{ key: 'reads', label: 'Times read' }];
	const weekLabel = new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const rows = $derived(
		activity.map((week) => ({
			week: weekLabel.format(new Date(week.weekStart)),
			reads: week.note + week.attachment + week.memory + week.skill
		}))
	);
</script>

<figure class="flex min-w-0 flex-col gap-4">
	<figcaption class="flex flex-col gap-1">
		<span class="section-title">How often the agent used this project</span>
		<span class="text-sm text-muted-foreground">
			Each bar is a week: how many times the agent read a note, file, memory entry or skill here.
		</span>
	</figcaption>
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">
			The agent hasn't read anything here yet. Ask about this project in a chat.
		</p>
	{:else}
		<Chart.Container config={Chart.chartConfigOf(series)} class="aspect-auto h-64 w-full">
			<BarChart
				data={rows}
				x="week"
				bandPadding={0.4}
				series={Chart.layerSeriesOf(series)}
				padding={{ left: 32, right: 8, top: 8, bottom: 24 }}
				props={{ bars: { radius: 2, strokeWidth: 0 }, yAxis: { format: Chart.countTick } }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	{/if}
</figure>
