import type { JsonValue, Widget } from '$lib/models/widgets';

/** Props whose literal value is words a person would search for, not a setting. */
const TEXT_PROPS = new Set([
	'text',
	'label',
	'title',
	'description',
	'placeholder',
	'detail',
	'empty'
]);

const labelsOf = (value: JsonValue): readonly string[] =>
	Array.isArray(value)
		? value.flatMap((entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				!Array.isArray(entry) &&
				typeof entry.label === 'string'
					? [entry.label]
					: []
			)
		: [];

/** Every string in the data except identifiers, which name rows rather than describe them. */
const dataStrings = (value: JsonValue, key?: string): readonly string[] => {
	if (typeof value === 'string') return key === 'id' ? [] : [value];
	if (Array.isArray(value)) return value.flatMap((entry) => dataStrings(entry));
	if (typeof value === 'object' && value !== null)
		return Object.entries(value).flatMap(([field, entry]) => dataStrings(entry, field));
	return [];
};

/**
 * The words a widget shows, for the knowledge index (ADR 0019). Booleans and numbers are left
 * out, so ticking a box or moving a counter changes no chunk and costs no new embedding.
 */
const widgetSearchText = (widget: Widget): string => {
	// A button's label names an action, not something the widget holds.
	const props = Object.values(widget.layout.elements)
		.filter((element) => element.type !== 'Button')
		.flatMap((element) =>
			Object.entries(element.props).flatMap(([name, value]) =>
				typeof value === 'string' && TEXT_PROPS.has(name)
					? [value]
					: name === 'columns' || name === 'options'
						? labelsOf(value)
						: []
			)
		);
	return [
		...new Set([widget.title, ...props, ...dataStrings(widget.data)].map((text) => text.trim()))
	]
		.filter(Boolean)
		.join('\n');
};

export interface IWidgetSearchService {
	text(widget: Widget): string;
}
export class WidgetSearchService implements IWidgetSearchService {
	text(widget: Widget): string {
		return widgetSearchText(widget);
	}
}
