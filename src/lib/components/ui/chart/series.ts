import type { ChartConfig } from './chart-utils.js';

/** One plotted field: the key it reads from each row, and the name a reader sees. */
export interface ChartSeries {
	readonly key: string;
	readonly label: string;
}

/**
 * The first series is the brand teal, the thing the chart is about; the rest take the neutral
 * chart ramp, darkest last. `--chart-1` is skipped: it is too light to read as a line on paper.
 * `--brand` rather than `--primary`, because it lifts in dark mode for contrast.
 */
export const seriesColor = (index: number): string =>
	index === 0 ? 'var(--brand)' : `var(--chart-${index + 1})`;

/** The shadcn chart config: a label and colour per series, read by the tooltip and legend. */
export const chartConfigOf = (series: readonly ChartSeries[]): ChartConfig =>
	Object.fromEntries(
		series.map((entry, index) => [entry.key, { label: entry.label, color: seriesColor(index) }])
	);

/** LayerChart series: each reads its field by key and draws in the colour the config names. */
export const layerSeriesOf = (series: readonly ChartSeries[]) =>
	series.map((entry) => ({
		key: entry.key,
		label: entry.label,
		color: `var(--color-${entry.key})`
	}));

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Value-axis ticks as `120K`, so they fit the room the padding leaves them. */
export const valueTick = (value: number): string => compact.format(value);

/**
 * Ticks for an axis of counts. A scale over a small range picks fractional ticks, and "0.4
 * lookups" is not a quantity a reader can have; those ticks are left unlabelled.
 */
export const countTick = (value: number): string =>
	Number.isInteger(value) ? compact.format(value) : '';
