import type { ChartConfig } from './chart-utils.js';

/** One plotted field: the key it reads from each row, and the name a reader sees. */
export interface ChartSeries {
	readonly key: string;
	readonly label: string;
	/** A colour with a role instead of the next ramp step — `remainderColor` for part-of-whole. */
	readonly color?: string;
}

/**
 * Charts are one hue: the teal ramp in `--chart-1` (lightest) to `--chart-5` (darkest), validated
 * as an ordered ramp in both modes. The first series is the brand teal, the thing the chart is
 * about; the rest alternate light and dark so neighbouring series never sit one step apart.
 * Identity never rests on the shade alone: a chart with several series always shows its legend.
 */
const seriesOrder = [
	'var(--brand)',
	'var(--chart-2)',
	'var(--chart-5)',
	'var(--chart-3)',
	'var(--chart-1)'
] as const;

/**
 * Never cycled: a sixth series would repaint the first one's colour. Widgets cap series at five
 * (`models/widgets`), which is exactly this order, so reaching past it is a bug, not a case.
 */
export const seriesColor = (index: number): string => {
	const color = seriesOrder[index];
	if (color === undefined)
		throw new RangeError(
			`A chart has ${seriesOrder.length} colours; series ${index + 1} has none.`
		);
	return color;
};

/** The remainder of a part-of-whole chart: what is not yet the thing the chart counts. */
export const remainderColor = 'var(--chart-1)';

/** The shadcn chart config: a label and colour per series, read by the tooltip and legend. */
export const chartConfigOf = (series: readonly ChartSeries[]): ChartConfig =>
	Object.fromEntries(
		series.map((entry, index) => [
			entry.key,
			{ label: entry.label, color: entry.color ?? seriesColor(index) }
		])
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
