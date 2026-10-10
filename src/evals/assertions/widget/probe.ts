import { WidgetSourceService } from '$lib/services/widgets/sources';
const widgetSourcesRule = new WidgetSourceService();
import type { LocalDate } from '$lib/models/workspace';
import type { TodoId, TodoResponsibility, TodoStatus } from '$lib/models/todos';
import type {
	JsonValue,
	Widget,
	WidgetData,
	WidgetDataTableColumn,
	WidgetElement
} from '$lib/models/widgets';
import type { WidgetSourceRecords } from '$lib/models/widgets';
import {
	describeReadout,
	isJsonObject,
	numbersIn,
	placedElements,
	readPointer,
	resolveProp,
	widgetReadout,
	type JsonObject,
	type ReadoutLine,
	type WidgetReadout
} from './readout';

/**
 * A person using a widget, written down.
 *
 * Every step finds what it touches by the words on screen — an input's label, a table's column, a
 * row's text — never by the data keys the agent chose. A probe therefore grades the widget a person
 * would get, and a correct widget passes whatever it names its state.
 *
 * Moving an input and reading the result again is the point. A widget that prints the right number
 * once but ignores its inputs is a picture of a calculator, and only a second reading tells the two
 * apart.
 */
export type ProbeStep =
	/** Type into a number field or move a slider. `percent` writes 0.06 for 6 when the input holds a fraction. */
	| {
			readonly kind: 'set';
			readonly input: RegExp;
			readonly value: number | string;
			readonly percent?: boolean;
	  }
	/** Add a row to an editable table and fill the named cells, as the table's add button and cells would. */
	| { readonly kind: 'addRow'; readonly cells: readonly ProbeCell[] }
	/** Type into a text field, then press the button that adds what was typed to a list. */
	| { readonly kind: 'addItem'; readonly input: RegExp; readonly text: string }
	/**
	 * Change the value a person finds by the words beside it: a cell in the table row whose text
	 * matches `row`, a control in a list item, or else a field labelled like `row` (and `column`).
	 */
	| {
			readonly kind: 'edit';
			readonly row: RegExp;
			readonly column?: RegExp;
			readonly value: boolean | number | string;
	  }
	/** Change the project's todos, as work done elsewhere in the app would. */
	| { readonly kind: 'addTodo'; readonly todo: ProbeTodo }
	/** A labelled value reads as a number within `tolerance` (relative) of `near`. */
	| {
			readonly kind: 'reads';
			readonly label: RegExp;
			/** Several values when more than one design is right, such as a weighted sum or average. */
			readonly near: number | readonly number[];
			readonly tolerance?: number;
			/** The value is a percentage, so a fraction (0.43 for 43%) reads as well. */
			readonly percent?: boolean;
	  }
	/** A labelled value reads as text matching `text`. */
	| { readonly kind: 'says'; readonly label: RegExp; readonly text: RegExp }
	/** Some chart plots at least `points` points. */
	| { readonly kind: 'chart'; readonly points: number }
	/** The widget shows `text` somewhere. */
	| { readonly kind: 'mentions'; readonly text: RegExp };

export interface ProbeCell {
	readonly column: RegExp;
	readonly value: boolean | number | string;
}

export interface ProbeTodo {
	readonly title: string;
	readonly status?: TodoStatus;
	readonly responsibility?: TodoResponsibility;
	readonly dueDate?: string;
}

export interface ProbeVerdict {
	readonly passed: boolean;
	/** One line per broken step, naming the step and what the widget showed instead. */
	readonly findings: readonly string[];
}

/** Relative slack on a numeric read: rounding in `format` and a person's own rounding. */
const DEFAULT_TOLERANCE = 0.005;

interface ProbeState {
	readonly data: WidgetData;
	readonly records: WidgetSourceRecords;
}

type StepOutcome =
	| { readonly kind: 'applied'; readonly state: ProbeState }
	| { readonly kind: 'checked' }
	| { readonly kind: 'failure'; readonly explanation: string };

const tokens = (pointer: string): readonly string[] =>
	pointer
		.slice(1)
		.split('/')
		.map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));

/** `document` with `value` at `pointer`, creating objects on the way. */
const writePointer = (document: JsonValue, pointer: string, value: JsonValue): JsonValue => {
	const write = (current: JsonValue | undefined, path: readonly string[]): JsonValue => {
		const [head, ...rest] = path;
		if (head === undefined) return value;
		if (Array.isArray(current)) {
			const index = head === '-' ? current.length : Number(head);
			const next = [...current];
			next[index] = write(current[index], rest);
			return next;
		}
		const base: JsonObject = isJsonObject(current) ? current : {};
		return { ...base, [head]: write(base[head], rest) };
	};
	return write(document, tokens(pointer));
};

const asData = (value: JsonValue): WidgetData => (isJsonObject(value) ? { ...value } : {});

const bound = (value: JsonValue | undefined): string | undefined =>
	isJsonObject(value) && typeof value.$bindState === 'string' ? value.$bindState : undefined;

const boundItem = (value: JsonValue | undefined): string | undefined =>
	isJsonObject(value) && typeof value.$bindItem === 'string' ? value.$bindItem : undefined;

const placed = (widget: Widget): readonly WidgetElement[] =>
	placedElements(widget.layout).map(([, element]) => element);

const INPUTS: ReadonlySet<string> = new Set(['NumberInput', 'Slider', 'TextInput', 'Select']);

const labelOf = (element: WidgetElement, state: JsonValue): string => {
	const label = resolveProp(element.props.label, state);
	return typeof label === 'string' ? label : '';
};

/** The text a Heading or Text element shows, or undefined for anything else. */
const captionOf = (element: WidgetElement, state: JsonValue): string | undefined => {
	if (element.type !== 'Heading' && element.type !== 'Text') return undefined;
	const text = resolveProp(element.props.text, state);
	return typeof text === 'string' ? text : undefined;
};

/**
 * An element's label with what names it on screen: the titles of the cards around it, and at
 * each level the nearest heading or text before it. A "Now" field under the heading "Deploy lead
 * time" reads "Deploy lead time Now". Tried only after own labels, since a card titled "Savings
 * simulator" would otherwise match every input inside it.
 */
const contextLabelOf = (widget: Widget, target: WidgetElement, state: JsonValue): string => {
	const parents = new Map<WidgetElement, WidgetElement>();
	for (const [, element] of placedElements(widget.layout))
		for (const child of element.children) {
			const placedChild = widget.layout.elements[child];
			if (placedChild) parents.set(placedChild, element);
		}
	const names: string[] = [];
	for (
		let at: WidgetElement = target, parent = parents.get(at);
		parent;
		at = parent, parent = parents.get(at)
	) {
		const siblings = parent.children.flatMap((key) => widget.layout.elements[key] ?? []);
		// The nearest heading names the section even when a line of text sits between it and the
		// field, as "Deploy lead time" over "120 min → 30 min" over an "Update current" input.
		const before = siblings.slice(0, siblings.indexOf(at));
		const nearest = (type: string) =>
			before
				.filter((sibling) => sibling.type === type)
				.map((sibling) => captionOf(sibling, state))
				.findLast((text) => text !== undefined);
		const title = resolveProp(parent.props.title, state);
		names.unshift(
			...(parent.type === 'Card' && typeof title === 'string' ? [title] : []),
			...[nearest('Heading'), nearest('Text')].filter((text) => text !== undefined)
		);
	}
	return [...names, labelOf(target, state)].join(' ');
};

/**
 * The element a person would pick: own label first, then its label in context, then — when
 * `fallback` allows — a looser match on its own label alone.
 */
const byLabel = (
	widget: Widget,
	candidates: readonly WidgetElement[],
	state: JsonValue,
	matches: (own: string, context: string) => boolean,
	fallback: (own: string, context: string) => boolean = () => false
): WidgetElement | undefined =>
	candidates.find((element) => matches(labelOf(element, state), labelOf(element, state))) ??
	candidates.find((element) =>
		matches(labelOf(element, state), contextLabelOf(widget, element, state))
	) ??
	candidates.find((element) => fallback(labelOf(element, state), labelOf(element, state))) ??
	candidates.find((element) =>
		fallback(labelOf(element, state), contextLabelOf(widget, element, state))
	);

const describeInputs = (widget: Widget, state: JsonValue): string =>
	placed(widget)
		.filter((element) => INPUTS.has(element.type) && bound(element.props.value))
		.map((element) => `"${labelOf(element, state)}"`)
		.join(', ') || 'none';

const set = (
	widget: Widget,
	state: ProbeState,
	step: Extract<ProbeStep, { kind: 'set' }>
): StepOutcome => {
	const input = byLabel(
		widget,
		placed(widget).filter((element) => INPUTS.has(element.type) && bound(element.props.value)),
		state.data,
		(_own, context) => step.input.test(context)
	);
	const pointer = input && bound(input.props.value);
	if (!pointer)
		return {
			kind: 'failure',
			explanation: `no input labelled ${step.input} is bound to the data; inputs: ${describeInputs(widget, state.data)}`
		};
	const current = readPointer(state.data, pointer);
	const fraction =
		step.percent === true &&
		typeof step.value === 'number' &&
		typeof current === 'number' &&
		Math.abs(current) < 1 &&
		(typeof input.props.max !== 'number' || input.props.max <= 1);
	const value =
		typeof current === 'string'
			? String(step.value)
			: fraction && typeof step.value === 'number'
				? step.value / 100
				: step.value;
	return {
		kind: 'applied',
		state: { ...state, data: asData(writePointer(state.data, pointer, value)) }
	};
};

const columnsOf = (element: WidgetElement): readonly WidgetDataTableColumn[] =>
	Array.isArray(element.props.columns)
		? element.props.columns.flatMap((column) =>
				isJsonObject(column) &&
				typeof column.key === 'string' &&
				typeof column.label === 'string' &&
				typeof column.kind === 'string'
					? [cellColumn(column, column.key, column.label, column.kind)]
					: []
			)
		: [];

const cellColumn = (
	column: JsonObject,
	key: string,
	label: string,
	kind: string
): WidgetDataTableColumn => {
	if (kind === 'select') {
		const options = Array.isArray(column.options)
			? column.options.flatMap((option) =>
					isJsonObject(option) &&
					typeof option.value === 'string' &&
					typeof option.label === 'string'
						? [{ value: option.value, label: option.label }]
						: []
				)
			: [];
		const [first, ...rest] = options;
		if (first) return { key, label, kind: 'select', options: [first, ...rest] };
	}
	return kind === 'number' || kind === 'checkbox'
		? { key, label, kind }
		: { key, label, kind: 'text' };
};

/**
 * The row a table's add button appends: each column's empty value. It mirrors `emptyRow` in
 * `components/widgets/tables/data-table-rows.ts`, which the eval cannot import past the widgets
 * component entry.
 */
const emptyRow = (columns: readonly WidgetDataTableColumn[]): JsonObject =>
	Object.fromEntries(
		columns.map((column) => [
			column.key,
			column.kind === 'text'
				? ''
				: column.kind === 'number'
					? 0
					: column.kind === 'checkbox'
						? false
						: column.options[0].value
		])
	);

/** What a cell holds when a person picks `value`: an option's value for a choice. */
const cellValue = (
	column: WidgetDataTableColumn,
	value: boolean | number | string
): JsonValue | undefined => {
	if (column.kind !== 'select') return value;
	const wanted = String(value).toLowerCase();
	return column.options.find(
		(option) => option.label.toLowerCase() === wanted || option.value.toLowerCase() === wanted
	)?.value;
};

/** Buttons that add to the list at `pointer`. A person needs one to add a row. */
const addsTo = (widget: Widget, pointer: string): boolean =>
	placed(widget).some((element) =>
		Object.values(element.on ?? {})
			.flatMap((binding) => (Array.isArray(binding) ? binding : [binding]))
			.some((binding) => binding.action === 'pushState' && binding.params?.statePath === pointer)
	);

const cellFits = (column: WidgetDataTableColumn, value: boolean | number | string): boolean =>
	typeof value === 'boolean'
		? column.kind === 'checkbox'
		: typeof value === 'number'
			? column.kind === 'number'
			: column.kind === 'text' ||
				(column.kind === 'select' && cellValue(column, value) !== undefined);

/**
 * A column for each cell, in order: its label matches, it holds that kind of value, and no two
 * cells share it. A trip table labels its names "Cost" and its numbers "Amount (€)"; matching
 * by label alone would put both cells in "Cost".
 */
const assignColumns = (
	columns: readonly WidgetDataTableColumn[],
	cells: readonly ProbeCell[]
): readonly WidgetDataTableColumn[] | undefined => {
	const assign = (
		index: number,
		used: ReadonlySet<string>
	): readonly WidgetDataTableColumn[] | undefined => {
		const cell = cells[index];
		if (!cell) return [];
		for (const column of columns) {
			if (used.has(column.key) || !cell.column.test(column.label) || !cellFits(column, cell.value))
				continue;
			const rest = assign(index + 1, new Set([...used, column.key]));
			if (rest) return [column, ...rest];
		}
		return undefined;
	};
	return assign(0, new Set());
};

const addRow = (
	widget: Widget,
	state: ProbeState,
	step: Extract<ProbeStep, { kind: 'addRow' }>
): StepOutcome => {
	const tables = placed(widget).filter(
		(element) => element.type === 'DataTable' && bound(element.props.rows)
	);
	const table = tables.find((element) => assignColumns(columnsOf(element), step.cells));
	const pointer = table && bound(table.props.rows);
	if (!table || !pointer)
		return {
			kind: 'failure',
			explanation: `no editable table has columns ${step.cells.map((cell) => cell.column).join(', ')}; tables: ${
				tables
					.map((element) =>
						columnsOf(element)
							.map((column) => column.label)
							.join('/')
					)
					.join('; ') || 'none'
			}`
		};
	if (typeof table.props.addLabel !== 'string' && !addsTo(widget, pointer))
		return { kind: 'failure', explanation: `the table at ${pointer} has no way to add a row` };
	const columns = columnsOf(table);
	const assigned = assignColumns(columns, step.cells) ?? [];
	let row: JsonObject = emptyRow(columns);
	for (const [index, cell] of step.cells.entries()) {
		const column = assigned[index];
		const value = column && cellValue(column, cell.value);
		if (!column || value === undefined)
			return {
				kind: 'failure',
				explanation: `the ${cell.column} column cannot hold "${cell.value}"`
			};
		row = { ...row, [column.key]: value };
	}
	const rows = readPointer(state.data, pointer);
	const next = [...(Array.isArray(rows) ? rows : []), row];
	return {
		kind: 'applied',
		state: { ...state, data: asData(writePointer(state.data, pointer, next)) }
	};
};

const addTableItem = (widget: Widget, state: ProbeState, text: string): StepOutcome | undefined => {
	const table = placed(widget).find(
		(element) =>
			element.type === 'DataTable' && columnsOf(element).some((column) => column.kind === 'text')
	);
	const column = table && columnsOf(table).find((candidate) => candidate.kind === 'text');
	return column
		? addRow(widget, state, {
				kind: 'addRow',
				cells: [{ column: new RegExp(`^${escapeRegExp(column.label)}$`), value: text }]
			})
		: undefined;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What `pushState` puts in the list: its value with each state read filled in, and a fresh id. */
const pushed = (value: JsonValue | undefined, data: JsonValue): JsonValue => {
	if (value === '$id') return `probe-${Math.random().toString(36).slice(2, 10)}`;
	if (Array.isArray(value)) return value.map((entry) => pushed(entry, data));
	if (!isJsonObject(value)) return value ?? null;
	if (typeof value.$state === 'string') return readPointer(data, value.$state) ?? null;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, pushed(entry, data)])
	);
};

const addItem = (
	widget: Widget,
	state: ProbeState,
	step: Extract<ProbeStep, { kind: 'addItem' }>
): StepOutcome => {
	const typed = set(widget, state, { kind: 'set', input: step.input, value: step.text });
	// A list kept as an editable table takes a new item as a row with its first text cell filled.
	if (typed.kind !== 'applied') return addTableItem(widget, state, step.text) ?? typed;
	const draft = placed(widget).find(
		(element) => element.type === 'TextInput' && step.input.test(labelOf(element, state.data))
	);
	const draftPointer = draft && bound(draft.props.value);
	// The button that reads the typed text: a person presses the one beside the field.
	const press = placed(widget)
		.filter((element) => element.type === 'Button')
		.flatMap((element) =>
			Object.values(element.on ?? {}).flatMap((binding) =>
				Array.isArray(binding) ? binding : [binding]
			)
		)
		.find(
			(binding) =>
				binding.action === 'pushState' &&
				draftPointer !== undefined &&
				JSON.stringify(binding.params?.value ?? null).includes(`"${draftPointer}"`)
		);
	const target = press?.params?.statePath;
	if (!press || typeof target !== 'string')
		return {
			kind: 'failure',
			explanation: `no button adds what is typed into ${step.input} to a list`
		};
	const data = typed.state.data;
	const list = readPointer(data, target);
	let next = writePointer(data, target, [
		...(Array.isArray(list) ? list : []),
		pushed(press.params?.value, data)
	]);
	const clear = press.params?.clearStatePath;
	if (typeof clear === 'string') next = writePointer(next, clear, '');
	return { kind: 'applied', state: { ...typed.state, data: asData(next) } };
};

const rowText = (row: JsonValue): string =>
	isJsonObject(row)
		? Object.values(row)
				.filter((value) => typeof value === 'string')
				.join(' ')
		: typeof row === 'string'
			? row
			: '';

/** The descendants of `key`, including itself, as a person would see them nested. */
const subtree = (widget: Widget, key: string): readonly WidgetElement[] => {
	const element = widget.layout.elements[key];
	return element ? [element, ...element.children.flatMap((child) => subtree(widget, child))] : [];
};

const kindFits = (element: WidgetElement, value: boolean | number | string): boolean =>
	typeof value === 'boolean'
		? element.type === 'Checkbox'
		: typeof value === 'number'
			? element.type === 'NumberInput' || element.type === 'Slider'
			: element.type === 'Select' || element.type === 'TextInput';

const optionValue = (element: WidgetElement, value: boolean | number | string): JsonValue =>
	element.type === 'Select' && Array.isArray(element.props.options)
		? (element.props.options
				.filter(isJsonObject)
				.find(
					(option) =>
						String(option.label).toLowerCase() === String(value).toLowerCase() ||
						String(option.value).toLowerCase() === String(value).toLowerCase()
				)?.value ?? null)
		: value;

const edit = (
	widget: Widget,
	state: ProbeState,
	step: Extract<ProbeStep, { kind: 'edit' }>
): StepOutcome => {
	// An editable table: the row by its text, the cell by its column.
	for (const table of placed(widget)) {
		const pointer = table.type === 'DataTable' ? bound(table.props.rows) : undefined;
		const rows = pointer ? readPointer(state.data, pointer) : undefined;
		if (!pointer || !Array.isArray(rows)) continue;
		const index = rows.findIndex((row) => step.row.test(rowText(row)));
		if (index === -1) continue;
		const column = columnsOf(table).find(
			(candidate) =>
				(step.column ? step.column.test(candidate.label) : true) &&
				(typeof step.value === 'boolean'
					? candidate.kind === 'checkbox'
					: typeof step.value === 'number'
						? candidate.kind === 'number'
						: candidate.kind === 'select' || candidate.kind === 'text')
		);
		const value = column && cellValue(column, step.value);
		if (!column || value === undefined) continue;
		return {
			kind: 'applied',
			state: {
				...state,
				data: asData(writePointer(state.data, `${pointer}/${index}/${column.key}`, value))
			}
		};
	}
	// A repeated list: the item by its text, the control bound to one of its fields.
	for (const [key, list] of placedElements(widget.layout)) {
		const items = list.repeat ? readPointer(state.data, list.repeat.statePath) : undefined;
		if (!list.repeat || !Array.isArray(items)) continue;
		const index = items.findIndex((item) => step.row.test(rowText(item)));
		if (index === -1) continue;
		const scope = items[index] ?? null;
		const control = subtree(widget, key).find((element) => {
			const field = boundItem(element.props.checked) ?? boundItem(element.props.value);
			const label =
				isJsonObject(element.props.label) && typeof element.props.label.$item === 'string'
					? String((isJsonObject(scope) && scope[element.props.label.$item]) ?? '')
					: labelOf(element, state.data);
			return (
				field !== undefined &&
				kindFits(element, step.value) &&
				(step.column ? step.column.test(label) : true)
			);
		});
		const field = control && (boundItem(control.props.checked) ?? boundItem(control.props.value));
		if (!control || !field) continue;
		const value = optionValue(control, step.value);
		if (value === null) continue;
		return {
			kind: 'applied',
			state: {
				...state,
				data: asData(writePointer(state.data, `${list.repeat.statePath}/${index}/${field}`, value))
			}
		};
	}
	// A field of its own, such as "Midterm score", when the value is not kept in a table.
	const field = byLabel(
		widget,
		placed(widget).filter(
			(element) =>
				(INPUTS.has(element.type) || element.type === 'Checkbox') &&
				fieldPointer(element) !== undefined &&
				kindFits(element, step.value)
		),
		state.data,
		(own, context) => step.row.test(context) && (step.column ? step.column.test(own) : true),
		// A field named only for its row needs no column word: "Midterm (30%)", or a field
		// labelled with its unit ("min") under the heading "Deploy lead time".
		(_own, context) => step.row.test(context)
	);
	const pointer = field && fieldPointer(field);
	if (field && pointer)
		return {
			kind: 'applied',
			state: {
				...state,
				data: asData(writePointer(state.data, pointer, optionValue(field, step.value)))
			}
		};
	return {
		kind: 'failure',
		explanation: `no row or field matching ${step.row}${step.column ? ` / ${step.column}` : ''} takes ${JSON.stringify(step.value)}; inputs: ${describeInputs(widget, state.data)}`
	};
};

/** Where a field writes: a checkbox binds `checked`, every other input binds `value`. */
const fieldPointer = (element: WidgetElement): string | undefined =>
	element.type === 'Checkbox' ? bound(element.props.checked) : bound(element.props.value);

const addTodo = (state: ProbeState, todo: ProbeTodo): StepOutcome => ({
	kind: 'applied',
	state: {
		...state,
		records: {
			...state.records,
			todos: [
				...state.records.todos,
				{
					id: `probe-${state.records.todos.length}` as TodoId,
					projectId: state.records.projectId,
					title: todo.title,
					status: todo.status ?? 'open',
					responsibility: todo.responsibility ?? 'mine',
					...(todo.dueDate ? { dueDate: todo.dueDate as LocalDate } : {})
				}
			]
		}
	}
});

/**
 * The lines under `label`: those it names, and the line just after a caption it names — a
 * "Leading option" heading over the text "Build in house" reads as one value.
 */
const labelled = (readout: WidgetReadout, label: RegExp): readonly ReadoutLine[] =>
	readout.lines.flatMap((line, index) => {
		if (!label.test(line.label)) return [];
		const next = readout.lines[index + 1];
		return line.label === line.text && next ? [line, next] : [line];
	});

const check = (readout: WidgetReadout, step: ProbeStep): StepOutcome => {
	switch (step.kind) {
		case 'reads': {
			const lines = labelled(readout, step.label);
			const tolerance = step.tolerance ?? DEFAULT_TOLERANCE;
			const nears = typeof step.near === 'number' ? [step.near] : step.near;
			const targets = nears.flatMap((near) => (step.percent ? [near, near / 100] : [near]));
			const hit = lines.some((line) =>
				numbersIn(line.text).some((value) =>
					targets.some(
						// A cent of slack for rounding, scaled down with a fraction.
						(target) =>
							Math.abs(value - target) <=
							Math.abs(target) * tolerance + (nears.includes(target) ? 0.01 : 0.0001)
					)
				)
			);
			return hit
				? { kind: 'checked' }
				: {
						kind: 'failure',
						explanation: `${step.label} should read about ${step.near}; ${
							lines.length
								? `it reads ${lines.map((line) => `"${line.text}"`).join(', ')}`
								: 'nothing has that label'
						}`
					};
		}
		case 'says': {
			const lines = labelled(readout, step.label);
			return lines.some((line) => step.text.test(line.text))
				? { kind: 'checked' }
				: {
						kind: 'failure',
						explanation: `${step.label} should say ${step.text}; ${
							lines.length
								? `it says ${lines.map((line) => `"${line.text}"`).join(', ')}`
								: 'nothing has that label'
						}`
					};
		}
		case 'chart':
			return readout.charts.some((chart) => chart.points >= step.points)
				? { kind: 'checked' }
				: {
						kind: 'failure',
						explanation: `no chart plots ${step.points} points; charts: ${
							readout.charts.map((chart) => `"${chart.title}" (${chart.points})`).join(', ') ||
							'none'
						}`
					};
		case 'mentions':
			return readout.lines.some((line) => step.text.test(line.label) || step.text.test(line.text))
				? { kind: 'checked' }
				: { kind: 'failure', explanation: `nothing shows ${step.text}` };
		default:
			return { kind: 'checked' };
	}
};

const act = (widget: Widget, state: ProbeState, step: ProbeStep): StepOutcome => {
	switch (step.kind) {
		case 'set':
			return set(widget, state, step);
		case 'addRow':
			return addRow(widget, state, step);
		case 'addItem':
			return addItem(widget, state, step);
		case 'edit':
			return edit(widget, state, step);
		case 'addTodo':
			return addTodo(state, step.todo);
		default:
			return { kind: 'checked' };
	}
};

const describeStep = (step: ProbeStep): string => {
	switch (step.kind) {
		case 'set':
			return `set ${step.input} to ${step.value}`;
		case 'addRow':
			return `add a row (${step.cells.map((cell) => `${cell.column}=${cell.value}`).join(', ')})`;
		case 'addItem':
			return `add "${step.text}" through ${step.input}`;
		case 'edit':
			return `set ${step.column ?? 'a control'} on ${step.row} to ${step.value}`;
		case 'addTodo':
			return `add todo "${step.todo.title}"`;
		case 'reads':
			return `read ${step.label} ≈ ${step.near}`;
		case 'says':
			return `read ${step.label} ~ ${step.text}`;
		case 'chart':
			return `see a chart of ${step.points}+ points`;
		case 'mentions':
			return `see ${step.text}`;
	}
};

/**
 * Run `steps` against the saved widget. A failed action stops the probe, since every later reading
 * would describe a state the person could not reach; a failed reading does not, so one run names
 * every wrong number. A formula that fails or a component the catalog lacks is a finding at
 * whichever step shows it.
 */
export const runWidgetProbe = (
	widget: Widget,
	records: WidgetSourceRecords,
	steps: readonly ProbeStep[]
): ProbeVerdict => {
	let state: ProbeState = { data: widget.data, records };
	const findings: string[] = [];
	const readout = () =>
		widgetReadout(
			widget,
			state.data,
			widgetSourcesRule.rows(widget.layout.sources ?? {}, state.records)
		);
	const seen = new Set<string>();
	const problems = (at: string) => {
		for (const problem of readout().problems)
			if (!seen.has(problem)) {
				seen.add(problem);
				findings.push(`${at}: ${problem}`);
			}
	};
	problems('as saved');
	for (const [index, step] of steps.entries()) {
		const label = `step ${index + 1} (${describeStep(step)})`;
		const acted = act(widget, state, step);
		if (acted.kind === 'failure') {
			findings.push(`${label}: ${acted.explanation}`);
			break;
		}
		if (acted.kind === 'applied') {
			state = acted.state;
			problems(label);
			continue;
		}
		const checked = check(readout(), step);
		if (checked.kind === 'failure') findings.push(`${label}: ${checked.explanation}`);
	}
	return {
		passed: findings.length === 0,
		findings:
			findings.length === 0 ? [] : [...findings, `widget shows: ${describeReadout(readout())}`]
	};
};
