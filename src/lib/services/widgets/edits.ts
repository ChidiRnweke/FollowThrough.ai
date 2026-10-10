import type {
	FormulaFunctionDefinition,
	FormulaParse,
	FormulaOperator,
	Formula,
	FormulaFunction
} from '$lib/models/widget-formulas';
import { formulaFunctions } from '$lib/models/widget-formulas';
import {
	widgetComputedRoots,
	type Widget,
	type WidgetDraft,
	type WidgetCreation,
	type WidgetEdit,
	type WidgetEditResult,
	type WidgetIssue,
	type WidgetLayout,
	type WidgetData,
	type WidgetSourceRows,
	type WidgetState,
	type JsonValue
} from '$lib/models/widgets';
type Token =
	| { readonly kind: 'number'; readonly value: number; readonly at: number }
	| { readonly kind: 'string'; readonly value: string; readonly at: number }
	| { readonly kind: 'name'; readonly value: string; readonly at: number }
	| { readonly kind: 'reference'; readonly value: string; readonly at: number }
	| { readonly kind: 'symbol'; readonly value: string; readonly at: number }
	| { readonly kind: 'end'; readonly at: number };

interface SyntaxFailure {
	readonly message: string;
	readonly at: number;
}

/** Thrown only to unwind the descent; what went wrong is recorded on the parser. */
const UNWIND = new Error('formula syntax failure');

const SYMBOLS = [
	'==',
	'!=',
	'<=',
	'>=',
	'(',
	')',
	'[',
	']',
	'{',
	'}',
	',',
	':',
	'.',
	'+',
	'-',
	'*',
	'/',
	'%',
	'^',
	'<',
	'>'
];

const PATTERNS = {
	space: /\s+/y,
	number: /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y,
	name: /[A-Za-z_][A-Za-z0-9_]*/y,
	reference: /@((?:\/[A-Za-z0-9_~-]*)+)/y,
	string: /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/y
};

const match = (pattern: RegExp, source: string, at: number) => {
	pattern.lastIndex = at;
	return pattern.exec(source);
};

const tokenize = (
	source: string
):
	| { readonly kind: 'tokens'; readonly tokens: readonly Token[] }
	| ({ readonly kind: 'failure' } & SyntaxFailure) => {
	const tokens: Token[] = [];
	let at = 0;
	while (at < source.length) {
		const space = match(PATTERNS.space, source, at);
		if (space) {
			at += space[0].length;
			continue;
		}
		const number = match(PATTERNS.number, source, at);
		const name = match(PATTERNS.name, source, at);
		const reference = match(PATTERNS.reference, source, at);
		const string = match(PATTERNS.string, source, at);
		const symbol = SYMBOLS.find((candidate) => source.startsWith(candidate, at));
		if (number) tokens.push({ kind: 'number', value: Number(number[0]), at });
		else if (name) tokens.push({ kind: 'name', value: name[0], at });
		else if (reference) tokens.push({ kind: 'reference', value: reference[1]!, at });
		else if (string)
			tokens.push({
				kind: 'string',
				value: (string[1] ?? string[2]!).replace(/\\(.)/g, '$1'),
				at
			});
		else if (symbol) tokens.push({ kind: 'symbol', value: symbol, at });
		else return { kind: 'failure', message: `Unexpected "${source[at]}"`, at };
		at += (number ?? name ?? reference ?? string)?.[0].length ?? symbol!.length;
	}
	return { kind: 'tokens', tokens: [...tokens, { kind: 'end', at }] };
};

const BINARY_LEVELS: readonly (readonly FormulaOperator[])[] = [
	['or'],
	['and'],
	['==', '!=', '<', '<=', '>', '>='],
	['+', '-'],
	['*', '/', '%']
];

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'null']);

const isFunction = (name: string): name is FormulaFunction => Object.hasOwn(formulaFunctions, name);

const describeToken = (token: Token) => (token.kind === 'end' ? 'the end' : `"${token.value}"`);

/** Recursive descent over the token list, one method per precedence level. */
class FormulaParser {
	private position = 0;
	private readonly scope: string[] = [];
	readonly references: string[] = [];
	failure: SyntaxFailure | undefined;

	constructor(private readonly tokens: readonly Token[]) {}

	private fail(message: string, at: number): never {
		this.failure = { message, at };
		throw UNWIND;
	}

	parse(): Formula {
		const formula = this.binary(0);
		const rest = this.peek();
		if (rest.kind !== 'end') this.fail(`Unexpected ${describeToken(rest)}`, rest.at);
		return formula;
	}

	private peek(): Token {
		return this.tokens[this.position]!;
	}

	private next(): Token {
		const token = this.peek();
		if (token.kind !== 'end') this.position += 1;
		return token;
	}

	private accept(value: string): boolean {
		const token = this.peek();
		if ((token.kind === 'symbol' || token.kind === 'name') && token.value === value) {
			this.position += 1;
			return true;
		}
		return false;
	}

	private expect(value: string): void {
		const token = this.peek();
		if (!this.accept(value))
			this.fail(`Expected "${value}" but found ${describeToken(token)}`, token.at);
	}

	private binary(level: number): Formula {
		const operators = BINARY_LEVELS[level];
		if (!operators) return this.unary();
		let left = this.binary(level + 1);
		for (;;) {
			const operator = operators.find((candidate) => this.accept(candidate));
			if (!operator) return left;
			left = { kind: 'binary', operator, left, right: this.binary(level + 1) };
		}
	}

	private unary(): Formula {
		if (this.accept('-')) return { kind: 'unary', operator: '-', operand: this.unary() };
		if (this.accept('not')) return { kind: 'unary', operator: 'not', operand: this.unary() };
		return this.power();
	}

	/** `^` binds tighter than a sign on its left and is right-associative: `-2^2` is `-4`. */
	private power(): Formula {
		const base = this.postfix();
		return this.accept('^')
			? { kind: 'binary', operator: '^', left: base, right: this.unary() }
			: base;
	}

	private postfix(): Formula {
		let target = this.primary();
		while (this.accept('.')) {
			const field = this.next();
			if (field.kind !== 'name') this.fail(`Expected a field name after "."`, field.at);
			target = { kind: 'member', target, field: field.value };
		}
		return target;
	}

	private primary(): Formula {
		const token = this.next();
		switch (token.kind) {
			case 'number':
				return { kind: 'number', value: token.value };
			case 'string':
				return { kind: 'string', value: token.value };
			case 'reference':
				this.references.push(token.value);
				return { kind: 'reference', pointer: token.value };
			case 'name':
				return this.named(token);
			case 'symbol':
				if (token.value === '(') {
					const inner = this.binary(0);
					this.expect(')');
					return inner;
				}
				if (token.value === '[') return { kind: 'list', items: this.list(']') };
				if (token.value === '{') return this.object();
				return this.fail(`Unexpected ${describeToken(token)}`, token.at);
			case 'end':
				return this.fail('The formula ends too early', token.at);
		}
	}

	private named(token: Extract<Token, { kind: 'name' }>): Formula {
		if (token.value === 'true' || token.value === 'false')
			return { kind: 'boolean', value: token.value === 'true' };
		if (token.value === 'null') return { kind: 'null' };
		if (this.accept('(')) return this.call(token);
		if (this.scope.includes(token.value)) return { kind: 'variable', name: token.value };
		this.fail(
			KEYWORDS.has(token.value)
				? `"${token.value}" needs a value on each side`
				: `Unknown name "${token.value}". Read data with @/path`,
			token.at
		);
	}

	private call(token: Extract<Token, { kind: 'name' }>): Formula {
		const name = token.value;
		if (!isFunction(name))
			this.fail(
				`Unknown function "${name}". Use one of: ${Object.keys(formulaFunctions).join(', ')}`,
				token.at
			);
		const definition: FormulaFunctionDefinition = formulaFunctions[name];
		const args: Formula[] = [];
		if (!this.accept(')')) {
			do {
				const body = definition.body?.index === args.length ? definition.body.names : [];
				this.scope.push(...body);
				args.push(this.binary(0));
				this.scope.splice(this.scope.length - body.length, body.length);
			} while (this.accept(','));
			this.expect(')');
		}
		if (args.length < definition.min || args.length > definition.max)
			this.fail(`Wrong number of arguments. Use ${definition.usage}`, token.at);
		return { kind: 'call', name, args };
	}

	private list(close: string): Formula[] {
		const items: Formula[] = [];
		if (this.accept(close)) return items;
		do items.push(this.binary(0));
		while (this.accept(','));
		this.expect(close);
		return items;
	}

	private object(): Formula {
		const fields: (readonly [string, Formula])[] = [];
		if (this.accept('}')) return { kind: 'object', fields };
		do {
			const key = this.next();
			if (key.kind !== 'name' && key.kind !== 'string') this.fail('Expected a field name', key.at);
			this.expect(':');
			fields.push([key.value, this.binary(0)]);
		} while (this.accept(','));
		this.expect('}');
		return { kind: 'object', fields };
	}
}

/** Parse a formula source. A failure names what is wrong and where, for the person who wrote it. */
const parseFormula = (source: string): FormulaParse => {
	const lexed = tokenize(source);
	if (lexed.kind === 'failure')
		return { kind: 'failure', message: `${lexed.message} (at character ${lexed.at + 1})` };
	const parser = new FormulaParser(lexed.tokens);
	try {
		const formula = parser.parse();
		return { kind: 'parsed', formula, references: parser.references };
	} catch (error) {
		if (error !== UNWIND || !parser.failure) throw error;
		const { message, at } = parser.failure;
		return { kind: 'failure', message: `${message} (at character ${at + 1})` };
	}
};

type FormulaJsonObject = { readonly [key: string]: JsonValue };

/**
 * The state a widget renders: its data with every computed root filled in, and the formulas that
 * could not be evaluated against this data. A failed formula reads as `null`; its issue says why.
 */

/**
 * Evaluation steps one widget may spend. Formulas run on every keystroke, in the browser, from a
 * layout an agent may have written; the budget keeps a `series` over millions of numbers from
 * freezing the tab. A thirty-year monthly schedule with a ten-node body costs about 4,000 steps.
 */
const STEP_BUDGET = 200_000;

class FormulaFailure extends Error {}

const isFormulaObject = (value: JsonValue | undefined): value is FormulaJsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const formulaPathTokens = (pointer: string): readonly string[] =>
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
				: isFormulaObject(current)
					? (current[token] ?? null)
					: null,
		document
	);

const describeValue = (value: JsonValue) =>
	value === null
		? 'nothing'
		: Array.isArray(value)
			? 'a list'
			: `a ${typeof value === 'object' ? 'record' : typeof value}`;

const numberOf = (value: JsonValue, what: string): number => {
	if (typeof value !== 'number')
		throw new FormulaFailure(`${what} needs a number, not ${describeValue(value)}`);
	return value;
};

const listOf = (value: JsonValue, what: string): readonly JsonValue[] => {
	if (!Array.isArray(value))
		throw new FormulaFailure(`${what} needs a list, not ${describeValue(value)}`);
	return value;
};

const booleanOf = (value: JsonValue, what: string): boolean => {
	if (typeof value !== 'boolean')
		throw new FormulaFailure(`${what} needs true or false, not ${describeValue(value)}`);
	return value;
};

const finite = (value: number): number => {
	if (!Number.isFinite(value)) throw new FormulaFailure('The result is too large to be a number');
	return value;
};

const textOf = (value: JsonValue): string =>
	value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

const formulaCanonical = (value: JsonValue): string =>
	JSON.stringify(value, (_key, inner: JsonValue) =>
		isFormulaObject(inner)
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
		/** The data with the source rows beside it: everything a reference can read but `derived`. */
		private readonly document: JsonValue,
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
		const [root, name, ...rest] = formulaPathTokens(pointer);
		if (root === 'derived' && name !== undefined) return readPath(this.derived(name), rest);
		return readPath(this.document, formulaPathTokens(pointer));
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
				if (!isFormulaObject(target))
					throw new FormulaFailure(
						`.${formula.field} needs a record, not ${describeValue(target)}`
					);
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
				return formulaCanonical(left) === formulaCanonical(right);
			case '!=':
				return formulaCanonical(left) !== formulaCanonical(right);
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
					const key = isFormulaObject(item) ? (item[field] ?? null) : null;
					const id = formulaCanonical(key);
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
 * The state a widget renders from its layout, saved data and source rows (ADR 0043). The same
 * rule runs in the view, in export and on the server, so a value never depends on where the
 * widget is shown.
 */
const resolveWidgetState = (
	layout: WidgetLayout,
	data: WidgetData,
	sources: WidgetSourceRows
): WidgetState => {
	const formulas = new Map(
		Object.entries(layout.derived ?? {}).map(([name, source]) => {
			const parsed = parseFormula(source);
			return [name, parsed.kind === 'parsed' ? parsed.formula : { failure: parsed.message }];
		})
	);
	const evaluation = new Evaluation({ ...data, sources }, formulas);
	const derived = Object.fromEntries(
		[...formulas.keys()].map((name) => [name, evaluation.derived(name)])
	);
	return { state: { ...data, sources, derived }, issues: evaluation.issues };
};

/** The names a formula reads under one computed root. `@/derived/total/0` reads `total`. */
const rootReads = (root: string, references: readonly string[]): readonly string[] =>
	references.flatMap((pointer) =>
		pointer.startsWith(`/${root}/`) ? [pointer.slice(root.length + 2).split('/')[0]!] : []
	);

/** The first chain of derived values that reads itself, if any. */
const derivedCycle = (
	reads: ReadonlyMap<string, readonly string[]>
): readonly string[] | undefined => {
	const visit = (name: string, path: readonly string[]): readonly string[] | undefined => {
		if (path.includes(name)) return [...path.slice(path.indexOf(name)), name];
		for (const next of reads.get(name) ?? []) {
			const cycle = visit(next, [...path, name]);
			if (cycle) return cycle;
		}
		return undefined;
	};
	for (const name of reads.keys()) {
		const cycle = visit(name, []);
		if (cycle) return cycle;
	}
	return undefined;
};

/** A pointer into a computed root, which a control must not write. */
const isComputedPointer = (pointer: string) =>
	widgetComputedRoots.some((root) => pointer === `/${root}` || pointer.startsWith(`/${root}/`));

/** Semantic checks run on already parsed layout/data values in creation and editing. */
const widgetFormulaIssues = (layout: WidgetLayout, data: WidgetData): readonly WidgetIssue[] => {
	const issues: WidgetIssue[] = [];
	let base = '/layout';
	const context = {
		addIssue: (issue: {
			readonly code: 'custom';
			readonly path: readonly (string | number)[];
			readonly message: string;
		}) => {
			issues.push({ path: base + '/' + issue.path.join('/'), message: issue.message });
		}
	};

	const derived = layout.derived ?? {};
	const sources = layout.sources ?? {};
	const references = new Map(
		Object.entries(derived).map(([name, source]) => {
			const parsed = parseFormula(source);
			if (parsed.kind === 'failure')
				context.addIssue({ code: 'custom', path: ['derived', name], message: parsed.message });
			return [name, parsed.kind === 'parsed' ? parsed.references : []];
		})
	);
	const reads = new Map(
		[...references].map(([name, pointers]) => [name, rootReads('derived', pointers)])
	);
	for (const [name, pointers] of references)
		for (const [root, defined] of [
			['derived', derived],
			['sources', sources]
		] as const)
			for (const missing of rootReads(root, pointers).filter(
				(read) => !Object.hasOwn(defined, read)
			))
				context.addIssue({
					code: 'custom',
					path: ['derived', name],
					message: `@/${root}/${missing} is not defined`
				});
	const cycle = derivedCycle(reads);
	if (cycle)
		context.addIssue({
			code: 'custom',
			path: ['derived', cycle[0]!],
			message: `These formulas read each other: ${cycle.join(' → ')}`
		});
	for (const [key, element] of Object.entries(layout.elements))
		for (const [prop, value] of Object.entries(element.props))
			if (
				typeof value === 'object' &&
				value !== null &&
				!Array.isArray(value) &&
				typeof value.$bindState === 'string' &&
				isComputedPointer(value.$bindState)
			)
				context.addIssue({
					code: 'custom',
					path: ['elements', key, 'props', prop],
					message: 'A computed value can be read with $state but not bound'
				});
	for (const [key, element] of Object.entries(layout.elements))
		for (const [event, bound] of Object.entries(element.on ?? {}))
			for (const [index, binding] of (Array.isArray(bound) ? bound : [bound]).entries())
				for (const param of ['statePath', 'clearStatePath'])
					if (
						typeof binding.params?.[param] === 'string' &&
						isComputedPointer(binding.params[param])
					)
						context.addIssue({
							code: 'custom',
							path: [
								'elements',
								key,
								'on',
								event,
								...(Array.isArray(bound) ? [index] : []),
								'params',
								param
							],
							message: 'An action cannot write a computed value'
						});
	base = '/data';

	for (const root of widgetComputedRoots)
		if (Object.hasOwn(data, root))
			context.addIssue({
				code: 'custom',
				path: [root],
				message: `"${root}" is reserved for computed values`
			});
	return issues;
};

export interface IWidgetEditingService {
	create(draft: WidgetDraft, creation: WidgetCreation, catalogVersion: number): Widget;
	decide(widget: Widget, boundaryIssues: readonly WidgetIssue[]): WidgetEditResult;
	revision(widget: Widget, edit: WidgetEdit): Extract<WidgetEditResult, { kind: 'stale' }> | null;
}
export class WidgetEditingService implements IWidgetEditingService {
	create(draft: WidgetDraft, creation: WidgetCreation, catalogVersion: number): Widget {
		return {
			id: creation.id,
			userId: creation.userId,
			projectId: creation.projectId,
			...(creation.sourceNoteId ? { sourceNoteId: creation.sourceNoteId } : {}),
			title: draft.title.trim(),
			catalogVersion: catalogVersion,
			layout: draft.layout,
			layoutRevision: 1,
			data: draft.data,
			dataRevision: 1,
			createdAt: creation.now,
			updatedAt: creation.now
		};
	}
	decide(widget: Widget, boundaryIssues: readonly WidgetIssue[]): WidgetEditResult {
		const issues = [...boundaryIssues, ...widgetFormulaIssues(widget.layout, widget.data)];
		return issues.length ? { kind: 'invalid', issues } : { kind: 'applied', widget };
	}
	revision(widget: Widget, edit: WidgetEdit): Extract<WidgetEditResult, { kind: 'stale' }> | null {
		if (edit.kind === 'data' && edit.expectedDataRevision !== widget.dataRevision)
			return { kind: 'stale', part: 'data', currentRevision: widget.dataRevision };
		if (edit.kind === 'layout' && edit.expectedLayoutRevision !== widget.layoutRevision)
			return { kind: 'stale', part: 'layout', currentRevision: widget.layoutRevision };
		return null;
	}
}
export interface IWidgetEvaluationService {
	resolve(layout: WidgetLayout, data: WidgetData, sources: WidgetSourceRows): WidgetState;
}
export class WidgetEvaluationService implements IWidgetEvaluationService {
	resolve(layout: WidgetLayout, data: WidgetData, sources: WidgetSourceRows): WidgetState {
		return resolveWidgetState(layout, data, sources);
	}
}
