import type {
	JsonValue,
	Widget,
	WidgetData,
	WidgetElement,
	WidgetExport,
	WidgetExportBlock,
	WidgetVisibility
} from '$lib/models/widgets';

type JsonObject = { readonly [key: string]: JsonValue };

/** Where a prop is resolved: the widget data, and the current item inside a repeat. */
interface Scope {
	readonly data: JsonValue;
	readonly item?: { readonly value: JsonValue; readonly index: number };
}

const isObject = (value: JsonValue | undefined): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const read = (document: JsonValue, pointer: string): JsonValue | undefined => {
	let current: JsonValue | undefined = document;
	for (const token of pointer === '' ? [] : pointer.slice(1).split('/')) {
		const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
		current = Array.isArray(current)
			? current[Number(key)]
			: isObject(current)
				? current[key]
				: undefined;
	}
	return current;
};

const itemField = (scope: Scope, field: string): JsonValue | undefined =>
	field === ''
		? scope.item?.value
		: isObject(scope.item?.value)
			? scope.item.value[field]
			: undefined;

/**
 * Resolve the prop expressions a layout may use (the catalog's allow-list): `$state`,
 * `$bindState`, `$item`, `$bindItem`, `$index` and `$template`. Anything else is a literal.
 */
const resolve = (value: JsonValue, scope: Scope): JsonValue | undefined => {
	if (!isObject(value)) return value;
	if (typeof value.$state === 'string') return read(scope.data, value.$state);
	if (typeof value.$bindState === 'string') return read(scope.data, value.$bindState);
	if (typeof value.$item === 'string') return itemField(scope, value.$item);
	if (typeof value.$bindItem === 'string') return itemField(scope, value.$bindItem);
	if (value.$index === true) return scope.item?.index;
	if (typeof value.$template === 'string')
		return value.$template.replace(/\$\{([^}]*)\}/g, (_match, pointer: string) => {
			const found = read(scope.data, pointer);
			return found === undefined || found === null ? '' : String(found);
		});
	return value;
};

const text = (value: JsonValue | undefined): string =>
	value === undefined || value === null ? '' : typeof value === 'object' ? '' : String(value);

const number = (value: JsonValue | undefined): number => (typeof value === 'number' ? value : 0);

const compare = (actual: JsonValue | undefined, condition: JsonObject, scope: Scope): boolean => {
	const operand = (key: string) => {
		const raw = condition[key];
		return raw === undefined ? undefined : resolve(raw, scope);
	};
	const checks: boolean[] = [];
	if ('eq' in condition) checks.push(JSON.stringify(actual) === JSON.stringify(operand('eq')));
	if ('neq' in condition) checks.push(JSON.stringify(actual) !== JSON.stringify(operand('neq')));
	if ('gt' in condition) checks.push(number(actual) > number(operand('gt')));
	if ('gte' in condition) checks.push(number(actual) >= number(operand('gte')));
	if ('lt' in condition) checks.push(number(actual) < number(operand('lt')));
	if ('lte' in condition) checks.push(number(actual) <= number(operand('lte')));
	const held = checks.length > 0 ? checks.every(Boolean) : Boolean(actual);
	return condition.not === true ? !held : held;
};

/** json-render's visibility rules, over the shapes `widgetVisibilitySchema` admits. */
const visible = (condition: WidgetVisibility | undefined, scope: Scope): boolean => {
	if (condition === undefined || typeof condition === 'boolean') return condition ?? true;
	if (Array.isArray(condition)) return condition.every((entry) => visible(entry, scope));
	if ('$and' in condition) return condition.$and.every((entry) => visible(entry, scope));
	if ('$or' in condition) return condition.$or.some((entry) => visible(entry, scope));
	const actual =
		'$state' in condition
			? read(scope.data, condition.$state)
			: '$item' in condition
				? itemField(scope, condition.$item)
				: scope.item?.index;
	return compare(actual, condition, scope);
};

/** A short value a row can hold inline, or undefined for a block that needs a line of its own. */
const inlineText = (block: WidgetExportBlock): string | undefined => {
	switch (block.kind) {
		case 'paragraph':
			return block.text;
		case 'field':
			return block.value;
		case 'badge':
			return `[${block.text}]`;
		case 'metric':
			return `${block.label}: ${block.value}`;
		default:
			return undefined;
	}
};

/**
 * A horizontal row reads as one line on paper, as it does on screen. A field's label usually
 * repeats the row's own name, so inside a row only its value is written.
 */
const oneLine = (blocks: readonly WidgetExportBlock[]): readonly WidgetExportBlock[] => {
	const parts = blocks.map(inlineText);
	if (blocks.length < 2 || parts.some((part) => part === undefined)) return blocks;
	return [{ kind: 'paragraph', text: parts.filter(Boolean).join(' · '), muted: false }];
};

const blocksOf = (
	key: string,
	elements: Readonly<Record<string, WidgetElement>>,
	scope: Scope
): readonly WidgetExportBlock[] => {
	const element = elements[key];
	if (!element || !visible(element.visible, scope)) return [];
	const prop = (name: string) => {
		const raw = element.props[name];
		return raw === undefined ? undefined : resolve(raw, scope);
	};
	const children = (inner: Scope): readonly WidgetExportBlock[] =>
		element.children.flatMap((child) => blocksOf(child, elements, inner));
	const body = (): readonly WidgetExportBlock[] => {
		if (!element.repeat) return children(scope);
		const list = read(scope.data, element.repeat.statePath);
		return Array.isArray(list)
			? list.flatMap((value, index) => children({ ...scope, item: { value, index } }))
			: [];
	};
	switch (element.type) {
		case 'Stack':
			return prop('direction') === 'horizontal' ? oneLine(body()) : body();
		case 'Card': {
			const title = text(prop('title'));
			return [
				...(title ? [{ kind: 'heading' as const, text: title, level: 3 as const }] : []),
				...body()
			];
		}
		case 'Heading': {
			const level = prop('level');
			return [
				{ kind: 'heading', text: text(prop('text')), level: level === 2 || level === 4 ? level : 3 }
			];
		}
		case 'Text':
			return [{ kind: 'paragraph', text: text(prop('text')), muted: prop('tone') === 'muted' }];
		case 'Checkbox':
			return [{ kind: 'check', label: text(prop('label')), checked: prop('checked') === true }];
		case 'TextInput':
		case 'NumberInput':
			return [{ kind: 'field', label: text(prop('label')), value: text(prop('value')) }];
		case 'Select': {
			const value = text(prop('value'));
			const options = prop('options');
			const chosen = Array.isArray(options)
				? options.find((option) => isObject(option) && option.value === value)
				: undefined;
			return [
				{
					kind: 'field',
					label: text(prop('label')),
					value: isObject(chosen) ? text(chosen.label) : value
				}
			];
		}
		case 'Progress':
			return [
				{
					kind: 'progress',
					label: text(prop('label')),
					value: number(prop('value')),
					max: number(prop('max'))
				}
			];
		case 'Metric': {
			const detail = text(prop('detail'));
			return [
				{
					kind: 'metric',
					label: text(prop('label')),
					value: text(prop('value')),
					...(detail ? { detail } : {})
				}
			];
		}
		case 'Table': {
			const columns = prop('columns');
			const rows = prop('rows');
			const keyed = Array.isArray(columns) ? columns.filter(isObject) : [];
			return [
				{
					kind: 'table',
					columns: keyed.map((column) => text(column.label)),
					rows: (Array.isArray(rows) ? rows.filter(isObject) : []).map((row) =>
						keyed.map((column) => text(row[text(column.key)]))
					)
				}
			];
		}
		case 'Badge':
			return [{ kind: 'badge', text: text(prop('text')) }];
		case 'Divider':
			return [{ kind: 'divider' }];
		default:
			return [{ kind: 'unsupported', type: element.type }];
	}
};

/**
 * The widget as a document shows it, for note export. Expressions, repeats and `visible` are
 * resolved against `state`, the saved data with its formulas worked out, so the export shows what
 * the widget showed when exported.
 */
export const widgetExport = (widget: Widget, state: WidgetData): WidgetExport => ({
	title: widget.title,
	blocks: blocksOf(widget.layout.root, widget.layout.elements, { data: state })
});
