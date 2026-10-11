import type { JsonValue, WidgetChartSeries } from '$lib/models/widgets';

/** The props every widget chart shares, as the catalog declares them. */
export interface WidgetChartProps {
	readonly title?: string | null;
	readonly rows: readonly { readonly [key: string]: JsonValue }[];
	readonly x: string;
	readonly series: readonly WidgetChartSeries[];
	readonly height?: 'sm' | 'md' | 'lg' | null;
	readonly stacked?: boolean | null;
}

export const chartHeightClass = (height: WidgetChartProps['height']): string =>
	height === 'sm' ? 'h-32' : height === 'lg' ? 'h-72' : 'h-48';

/**
 * Room for the axes and the legend inside the widget. LayerChart draws tick labels outside the
 * plot, and a widget card clips anything past its edge; the legend sits below the x-axis labels.
 */
export const chartPadding = (series: readonly WidgetChartSeries[]) => ({
	left: 40,
	right: 8,
	top: 8,
	bottom: series.length > 1 ? 52 : 24
});
