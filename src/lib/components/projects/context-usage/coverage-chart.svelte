<script lang="ts">
	import { BarChart } from 'layerchart';
	import type { KindCoverage } from '$lib/models/context-usage';
	import * as Chart from '$lib/components/ui/chart';
	import { kindNoun } from './kinds';

	let { coverage }: { coverage: readonly KindCoverage[] } = $props();

	const series: readonly Chart.ChartSeries[] = [
		{ key: 'used', label: 'Looked up' },
		{ key: 'unused', label: 'Not looked up yet' }
	];
	const rows = $derived(
		coverage
			.filter((kind) => kind.total > 0)
			.map((kind) => ({
				kind: kindNoun[kind.kind][1],
				used: kind.used,
				unused: kind.total - kind.used
			}))
	);
</script>

<figure class="flex min-w-0 flex-col gap-2">
	<figcaption class="flex flex-col gap-0.5">
		<span class="text-sm font-medium">How much of each kind it uses</span>
		<span class="text-label text-muted-foreground">
			Of everything in this project, how much the agent has looked up at least once.
		</span>
	</figcaption>
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">This project has no notes, files or memory yet.</p>
	{:else}
		<Chart.Container config={Chart.chartConfigOf(series)} class="aspect-auto h-56 w-full">
			<BarChart
				data={rows}
				y="kind"
				orientation="horizontal"
				series={Chart.layerSeriesOf(series)}
				seriesLayout="stack"
				legend
				padding={{ left: 64, right: 12, top: 4, bottom: 52 }}
				props={{ bars: { radius: 2, strokeWidth: 0 }, xAxis: { format: Chart.countTick } }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
	{/if}
</figure>
