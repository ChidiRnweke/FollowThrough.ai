import { parseFormula, type Formula, type FormulaFunction } from '$lib/models/widget-formulas';
import {
	widgetComputedRoots,
	type JsonValue,
	type WidgetData,
	type WidgetIssue,
	type WidgetLayout
} from '$lib/models/widgets';

type JsonObject = { readonly [key: string]: JsonValue };

/**
 * The state a widget renders: its data with every computed root filled in, and the formulas that
 * could not be evaluated against this data. A failed formula reads as `null`; its issue says why.
 */
export interface WidgetState {
	readonly state: WidgetData;
	readonly issues: readonly WidgetIssue[];
}

/**
 * Evaluation steps one widget may spend. Formulas run on every keystroke, in the browser, from a
 * layout an agent may have written; the budget keeps a `series` over millions of numbers from
 * freezing the tab. A thirty-year monthly schedule with a ten-node body costs about 4,000 steps.
 */
const STEP_BUDGET = 200_000;

class FormulaFailure extends Error {}

const isObject = (value: JsonValue | undefined): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const tokens = (pointer: string): readonly string[] =>
	pointer === ''
		? []
		: pointer
				.slice(1)
				.split('/')
				.map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));

const readPath = (document: JsonValue, path: readonly string[]): JsonValue =>
	path.reduce<JsonValue>(
		(current, token) =>
			Array.isArray(current)
				? (current[Number(token)] ?? null)
				: isObject(current)
					? (current[token] ?? null)
					: null,
		document
	);

const describe = (value: JsonValue) =>
	value === null
		? 'nothing'
		: Array.isArray(value)
			? 'a list'
			: `a ${typeof value === 'object' ? 'record' : typeof value}`;

const numberOf = (value: JsonValue, what: string): number => {
	if (typeof value !== 'number')
		throw new FormulaFailure(`${what} needs a number, not ${describe(value)}`);
	return value;
};

const listOf = (value: JsonValue, what: string): readonly JsonValue[] => {
	if (!Array.isArray(value))
		throw new FormulaFailure(`${what} needs a list, not ${describe(value)}`);
	return value;
};

const booleanOf = (value: JsonValue, what: string): boolean => {
	if (typeof value !== 'boolean')
		throw new FormulaFailure(`${what} needs true or false, not ${describe(value)}`);
	return value;
};

const finite = (value: number): number => {
	if (!Number.isFinite(value)) throw new FormulaFailure('The result is too large to be a number');
	return value;
};

const textOf = (value: JsonValue): string =>
	value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

const canonical = (value: JsonValue): string =>
	JSON.stringify(value, (_key, inner: JsonValue) =>
		isObject(inner)
			? Object.fromEntries(
					Object.keys(inner)
						.sort()
						.map((key) => [key, inner[key]])
				)
			: inner
	);

const numbers = (values: readonly JsonValue[], what: string) =>
	values.map((value) => numberOf(value, what));

/** `min(a, b)` and `min(list)` are both allowed: one list argument is the list to reduce. */
const spread = (values: readonly JsonValue[], what: string): readonly number[] => {
	const all = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
	if (all.length === 0) throw new FormulaFailure(`${what} of an empty list has no value`);
	return numbers(all, what);
};

const formatter = (digits: number) =>
	new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** One evaluation of a widget's formulas: a step budget and the values worked out so far. */
class Evaluation {
	private steps = 0;
	private readonly results = new Map<string, JsonValue>();
	private readonly running = new Set<string>();
	readonly issues: WidgetIssue[] = [];

	constructor(
		private readonly data: WidgetData,
		private readonly formulas: ReadonlyMap<string, Formula | { readonly failure: string }>
	) {}

	/** A derived value, evaluated the first time something reads it. */
	derived(name: string): JsonValue {
		const known = this.results.get(name);
		if (known !== undefined) return known;
		const formula = this.formulas.get(name);
		if (!formula || this.running.has(name)) return null;
		this.running.add(name);
		const value = this.settle(name, formula);
		this.running.delete(name);
		this.results.set(name, value);
		return value;
	}

	private settle(name: string, formula: Formula | { readonly failure: string }): JsonValue {
		const outcome =
			'failure' in formula
				? { kind: 'failure' as const, message: formula.failure }
				: this.attempt(formula);
		if (outcome.kind === 'value') return outcome.value;
		this.issues.push({ path: `/layout/derived/${name}`, message: outcome.message });
		return null;
	}

	private attempt(
		formula: Formula
	):
		| { readonly kind: 'value'; readonly value: JsonValue }
		| { readonly kind: 'failure'; readonly message: string } {
		try {
			return { kind: 'value', value: this.evaluate(formula, new Map()) };
		} catch (error) {
			if (!(error instanceof FormulaFailure)) throw error;
			return { kind: 'failure', message: error.message };
		}
	}

	private read(pointer: string): JsonValue {
		const [root, name, ...rest] = tokens(pointer);
		if (root === 'derived' && name !== undefined) return readPath(this.derived(name), rest);
		return readPath(this.data, tokens(pointer));
	}

	private evaluate(formula: Formula, scope: ReadonlyMap<string, JsonValue>): JsonValue {
		this.steps += 1;
		if (this.steps > STEP_BUDGET)
			throw new FormulaFailure('The formulas take too many steps to work out');
		switch (formula.kind) {
			case 'number':
			case 'string':
			case 'boolean':
				return formula.value;
			case 'null':
				return null;
			case 'reference':
				return this.read(formula.pointer);
			case 'variable':
				return scope.get(formula.name) ?? null;
			case 'member': {
				const target = this.evaluate(formula.target, scope);
				if (target === null) return null;
				if (!isObject(target))
					throw new FormulaFailure(`.${formula.field} needs a record, not ${describe(target)}`);
				return target[formula.field] ?? null;
			}
			case 'unary': {
				const operand = this.evaluate(formula.operand, scope);
				return formula.operator === '-' ? -numberOf(operand, '-') : !booleanOf(operand, 'not');
			}
			case 'binary':
				return this.binary(formula, scope);
			case 'call':
				return this.call(formula.name, formula.args, scope);
			case 'object':
				return Object.fromEntries(
					formula.fields.map(([key, value]) => [key, this.evaluate(value, scope)])
				);
			case 'list':
				return formula.items.map((item) => this.evaluate(item, scope));
		}
	}

	private binary(
		formula: Extract<Formula, { kind: 'binary' }>,
		scope: ReadonlyMap<string, JsonValue>
	): JsonValue {
		const { operator } = formula;
		const left = this.evaluate(formula.left, scope);
		// `and` and `or` stop early, so `@/count > 0 and @/total / @/count > 2` cannot divide by zero.
		if (operator === 'and')
			return booleanOf(left, 'and') && booleanOf(this.evaluate(formula.right, scope), 'and');
		if (operator === 'or')
			return booleanOf(left, 'or') || booleanOf(this.evaluate(formula.right, scope), 'or');
		const right = this.evaluate(formula.right, scope);
		switch (operator) {
			case '==':
				return canonical(left) === canonical(right);
			case '!=':
				return canonical(left) !== canonical(right);
			case '+':
				return typeof left === 'string' || typeof right === 'string'
					? textOf(left) + textOf(right)
					: finite(numberOf(left, '+') + numberOf(right, '+'));
			case '-':
				return finite(numberOf(left, '-') - numberOf(right, '-'));
			case '*':
				return finite(numberOf(left, '*') * numberOf(right, '*'));
			case '/':
			case '%': {
				const divisor = numberOf(right, operator);
				if (divisor === 0) throw new FormulaFailure('Division by zero');
				const dividend = numberOf(left, operator);
				return finite(operator === '/' ? dividend / divisor : dividend % divisor);
			}
			case '^':
				return finite(numberOf(left, '^') ** numberOf(right, '^'));
			case '<':
				return numberOf(left, '<') < numberOf(right, '<');
			case '<=':
				return numberOf(left, '<=') <= numberOf(right, '<=');
			case '>':
				return numberOf(left, '>') > numberOf(right, '>');
			case '>=':
				return numberOf(left, '>=') >= numberOf(right, '>=');
		}
	}

	private call(
		name: FormulaFunction,
		args: readonly Formula[],
		scope: ReadonlyMap<string, JsonValue>
	): JsonValue {
		const value = (index: number) => this.evaluate(args[index]!, scope);
		const each = (list: readonly JsonValue[], body: Formula) =>
			list.map((item, i) => ({
				item,
				result: this.evaluate(body, new Map([...scope, ['item', item], ['i', i]]))
			}));
		switch (name) {
			case 'if':
				return booleanOf(value(0), 'if') ? value(1) : value(2);
			case 'round': {
				const factor = 10 ** (args.length > 1 ? numberOf(value(1), 'round') : 0);
				return Math.round(numberOf(value(0), 'round') * factor) / factor;
			}
			case 'floor':
				return Math.floor(numberOf(value(0), 'floor'));
			case 'ceil':
				return Math.ceil(numberOf(value(0), 'ceil'));
			case 'abs':
				return Math.abs(numberOf(value(0), 'abs'));
			case 'min':
				return Math.min(
					...spread(
						args.map((_, index) => value(index)),
						'min'
					)
				);
			case 'max':
				return Math.max(
					...spread(
						args.map((_, index) => value(index)),
						'max'
					)
				);
			case 'sum':
				return finite(numbers(listOf(value(0), 'sum'), 'sum').reduce((total, n) => total + n, 0));
			case 'avg': {
				const list = numbers(listOf(value(0), 'avg'), 'avg');
				if (list.length === 0) throw new FormulaFailure('avg of an empty list has no value');
				return list.reduce((total, n) => total + n, 0) / list.length;
			}
			case 'count':
				return listOf(value(0), 'count').length;
			case 'first':
				return listOf(value(0), 'first')[0] ?? null;
			case 'last':
				return listOf(value(0), 'last').at(-1) ?? null;
			case 'format': {
				const digits = args.length > 1 ? numberOf(value(1), 'format') : 0;
				if (!Number.isInteger(digits) || digits < 0 || digits > 10)
					throw new FormulaFailure('format needs 0 to 10 digits');
				return formatter(digits).format(numberOf(value(0), 'format'));
			}
			case 'series': {
				const from = numberOf(value(0), 'series');
				const to = numberOf(value(1), 'series');
				if (!Number.isInteger(from) || !Number.isInteger(to))
					throw new FormulaFailure('series needs whole numbers');
				return Array.from({ length: Math.max(to - from + 1, 0) }, (_, offset) =>
					this.evaluate(args[2]!, new Map([...scope, ['i', from + offset]]))
				);
			}
			case 'map':
				return each(listOf(value(0), 'map'), args[1]!).map(({ result }) => result);
			case 'group': {
				const field = value(1);
				if (typeof field !== 'string') throw new FormulaFailure('group needs a field name');
				const groups = new Map<string, { key: JsonValue; items: JsonValue[] }>();
				for (const item of listOf(value(0), 'group')) {
					const key = isObject(item) ? (item[field] ?? null) : null;
					const id = canonical(key);
					const group = groups.get(id) ?? { key, items: [] };
					group.items.push(item);
					groups.set(id, group);
				}
				return [...groups.values()];
			}
			case 'filter':
				return each(listOf(value(0), 'filter'), args[1]!)
					.filter(({ result }) => booleanOf(result, 'filter'))
					.map(({ item }) => item);
		}
	}
}

/**
 * The state a widget renders from its layout and saved data (ADR 0043). The same rule runs in the
 * view, in export and on the server, so a value never depends on where the widget is shown.
 */
export const resolveWidgetState = (layout: WidgetLayout, data: WidgetData): WidgetState => {
	const formulas = new Map(
		Object.entries(layout.derived ?? {}).map(([name, source]) => {
			const parsed = parseFormula(source);
			return [name, parsed.kind === 'parsed' ? parsed.formula : { failure: parsed.message }];
		})
	);
	const evaluation = new Evaluation(data, formulas);
	const derived = Object.fromEntries(
		[...formulas.keys()].map((name) => [name, evaluation.derived(name)])
	);
	return { state: { ...data, derived }, issues: evaluation.issues };
};

/** The saved part of a rendered state: everything except the computed roots. */
export const widgetDataOf = <T>(state: { readonly [key: string]: T }): { [key: string]: T } =>
	Object.fromEntries(
		Object.entries(state).filter(
			([key]) => !(widgetComputedRoots as readonly string[]).includes(key)
		)
	);
