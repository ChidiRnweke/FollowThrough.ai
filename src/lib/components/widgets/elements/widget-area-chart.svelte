<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { AreaChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import ChartFrame from '../charts/chart-frame.svelte';
	import {
		chartPadding,
		layerSeriesOf,
		valueTick,
		type WidgetChartProps
	} from '../charts/chart-series';

	let { props }: BaseComponentProps<WidgetChartProps> = $props();
</script>

<ChartFrame {props}>
	<AreaChart
		data={props.rows}
		x={props.x}
		series={layerSeriesOf(props.series)}
		seriesLayout={props.stacked ? 'stack' : 'overlap'}
		legend={props.series.length > 1}
		padding={chartPadding(props.series)}
		props={{ area: { fillOpacity: 0.3, line: { strokeWidth: 2 } }, yAxis: { format: valueTick } }}
	>
		{#snippet tooltip()}
			<Chart.Tooltip />
		{/snippet}
	</AreaChart>
</ChartFrame>
