import type { ChartConfig } from '$lib/components/ui/chart';
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

/**
 * The first series is the brand teal, the thing the widget is about; the rest take the neutral
 * chart ramp, darkest last. `--chart-1` is skipped: it is too light to read as a line on paper.
 * `--brand` rather than `--primary`, because it lifts in dark mode for contrast.
 */
export const seriesColor = (index: number): string =>
	index === 0 ? 'var(--brand)' : `var(--chart-${index + 1})`;

/** The shadcn chart config: a label and colour per series, read by the tooltip and legend. */
export const chartConfigOf = (series: readonly WidgetChartSeries[]): ChartConfig =>
	Object.fromEntries(
		series.map((entry, index) => [entry.key, { label: entry.label, color: seriesColor(index) }])
	);

/** LayerChart series: each reads its field by key and draws in the colour the config names. */
export const layerSeriesOf = (series: readonly WidgetChartSeries[]) =>
	series.map((entry) => ({
		key: entry.key,
		label: entry.label,
		color: `var(--color-${entry.key})`
	}));

export const chartHeightClass = (height: WidgetChartProps['height']): string =>
	height === 'sm' ? 'h-32' : height === 'lg' ? 'h-72' : 'h-48';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Value-axis ticks as `120K`, so they fit the room the padding leaves them. */
export const valueTick = (value: number): string => compact.format(value);

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
