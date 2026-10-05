import type {
	JsonValue,
	Widget,
	WidgetData,
	WidgetElement,
	WidgetExportBlock,
	WidgetSourceRows
} from '$lib/models/widgets';
import { resolveWidgetState } from '$lib/services/widgets/formulas';
import { widgetExport } from '$lib/services/widgets/export-blocks';

export type JsonObject = { readonly [key: string]: JsonValue };

export const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** One thing the widget shows, under the words a person would find it by. */
export interface ReadoutLine {
	readonly label: string;
	readonly text: string;
}

/** A chart as a person sees it: its title and how many points it plots. */
export interface ChartReadout {
	readonly title: string;
	readonly points: number;
}

/**
 * What a widget shows for one state of its data, read the way a person reads it.
 *
 * The grader never looks at the agent's data keys or formula names, which are its own business.
 * It reads labels and values, so two widgets that look the same to a person grade the same.
 */
export interface WidgetReadout {
	readonly lines: readonly ReadoutLine[];
	readonly charts: readonly ChartReadout[];
	/** Formulas that failed and components the export cannot show: a person sees an error. */
	readonly problems: readonly string[];
}

const CHARTS: ReadonlySet<string> = new Set(['LineChart', 'AreaChart', 'BarChart']);

export const isChart = (element: WidgetElement): boolean => CHARTS.has(element.type);

/**
 * The elements a person can see: the root and everything under it. A layout may keep elements
 * that nothing places, and a control nobody can reach does nothing for the person.
 */
export const placedElements = (
	layout: Widget['layout']
): readonly (readonly [string, WidgetElement])[] => {
	const placed = new Map<string, WidgetElement>();
	const visit = (key: string) => {
		const element = layout.elements[key];
		if (!element || placed.has(key)) return;
		placed.set(key, element);
		element.children.forEach(visit);
	};
	visit(layout.root);
	return [...placed];
};

/**
 * The export joins a horizontal row into one line ("Spent: 1,446.50 · Left: 553.50"). The grader
 * needs each value under its own label, so it reads a copy laid out vertically. Nothing else in
 * the layout changes.
 */
const unrolled = (elements: Widget['layout']['elements']): Widget['layout']['elements'] =>
	Object.fromEntries(
		Object.entries(elements).map(([key, element]) => [
			key,
			element.type === 'Stack'
				? { ...element, props: { ...element.props, direction: 'vertical' } }
				: element
		])
	);

const linesOf = (block: WidgetExportBlock): readonly ReadoutLine[] => {
	switch (block.kind) {
		case 'heading':
		case 'paragraph':
		case 'badge':
			return [{ label: block.text, text: block.text }];
		case 'check':
			return [{ label: block.label, text: block.checked ? 'checked' : 'unchecked' }];
		case 'field':
			return [{ label: block.label, text: block.value }];
		case 'metric':
			return [{ label: block.label, text: [block.value, block.detail].filter(Boolean).join(' ') }];
		case 'progress':
			return [{ label: block.label, text: `${block.value} of ${block.max}` }];
		// Each cell reads under its row's first cell and its column: "Total Amount", "Rent Paid".
		case 'table':
			return block.rows.flatMap((row) =>
				row.map((cell, index) => ({
					label: `${row[0] ?? ''} ${block.columns[index] ?? ''}`.trim(),
					text: cell
				}))
			);
		case 'divider':
		case 'unsupported':
			return [];
	}
};

export const readPointer = (document: JsonValue, pointer: string): JsonValue | undefined =>
	pointer === ''
		? document
		: pointer
				.slice(1)
				.split('/')
				.map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
				.reduce<JsonValue | undefined>(
					(current, key) =>
						Array.isArray(current)
							? current[Number(key)]
							: isJsonObject(current)
								? current[key]
								: undefined,
					document
				);

/** A prop as it reads outside any repeat: a literal, a state read or a filled-in template. */
export const resolveProp = (
	value: JsonValue | undefined,
	state: JsonValue
): JsonValue | undefined => {
	if (!isJsonObject(value)) return value;
	if (typeof value.$state === 'string') return readPointer(state, value.$state);
	if (typeof value.$bindState === 'string') return readPointer(state, value.$bindState);
	if (typeof value.$template === 'string')
		return value.$template.replace(/\$\{([^}]*)\}/g, (_match, pointer: string) => {
			const found = readPointer(state, pointer);
			return found === undefined || found === null ? '' : String(found);
		});
	return value;
};

/** What the widget shows for `data`, with its formulas worked out over `sources`. */
export const widgetReadout = (
	widget: Widget,
	data: WidgetData,
	sources: WidgetSourceRows
): WidgetReadout => {
	const { state, issues } = resolveWidgetState(widget.layout, data, sources);
	const exported = widgetExport(
		{ ...widget, layout: { ...widget.layout, elements: unrolled(widget.layout.elements) } },
		state
	);
	const charts = placedElements(widget.layout)
		.map(([, element]) => element)
		.filter(isChart)
		.map((chart) => {
			const rows = resolveProp(chart.props.rows, state);
			const title = resolveProp(chart.props.title, state);
			return {
				title: typeof title === 'string' ? title : '',
				points: Array.isArray(rows) ? rows.length : 0
			};
		});
	return {
		lines: withRowLabels(exported.blocks.flatMap(linesOf)),
		charts,
		problems: [
			...issues.map((issue) => `${issue.path}: ${issue.message}`),
			...exported.blocks.flatMap((block) =>
				block.kind === 'unsupported' ? [`${block.type} is not in the catalog`] : []
			)
		]
	};
};

/**
 * A value with no label of its own reads under the text just before it, as it does on screen:
 * a row of "Design" and a dropdown showing "On track" reads "Design: On track".
 */
const withRowLabels = (lines: readonly ReadoutLine[]): readonly ReadoutLine[] =>
	lines.map((line, index) => {
		const before = lines[index - 1];
		return line.label === '' && before && before.label === before.text
			? { label: before.label, text: line.text }
			: line;
	});

/** Every number written in `text`: "129,885", "€1,319.59", "5%", "7 of 14". */
export const numbersIn = (text: string): readonly number[] =>
	[...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replaceAll(',', '')));

/** The readout as text, for a failure message a person can read. */
export const describeReadout = (readout: WidgetReadout): string =>
	[
		...readout.lines.map((line) =>
			line.label === line.text ? line.text : `${line.label}: ${line.text}`
		),
		...readout.charts.map((chart) => `[chart "${chart.title}" · ${chart.points} points]`)
	]
		.join(' | ')
		.slice(0, 1200);
