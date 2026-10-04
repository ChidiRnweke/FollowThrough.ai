<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { LineChart } from 'layerchart';
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
	<LineChart
		data={props.rows}
		x={props.x}
		series={layerSeriesOf(props.series)}
		legend={props.series.length > 1}
		padding={chartPadding(props.series)}
		props={{ spline: { strokeWidth: 2 }, yAxis: { format: valueTick } }}
	>
		{#snippet tooltip()}
			<Chart.Tooltip />
		{/snippet}
	</LineChart>
</ChartFrame>
