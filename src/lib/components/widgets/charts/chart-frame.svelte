<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Chart from '$lib/components/ui/chart';
	import { chartConfigOf, chartHeightClass, type WidgetChartProps } from './chart-series';

	let { props, children }: { props: WidgetChartProps; children: Snippet } = $props();
</script>

<!-- The title and the empty state are the widget's; the plot is shadcn's chart over LayerChart. -->
<figure data-slot="widget-chart" class="flex min-w-0 flex-col gap-1.5">
	{#if props.title}
		<figcaption class="text-label text-muted-foreground">{props.title}</figcaption>
	{/if}
	{#if props.rows.length === 0}
		<p class="text-sm text-muted-foreground">Nothing to plot yet.</p>
	{:else}
		<Chart.Container
			config={chartConfigOf(props.series)}
			class={['aspect-auto w-full', chartHeightClass(props.height)]}
		>
			{@render children()}
		</Chart.Container>
	{/if}
</figure>
