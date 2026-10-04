import { z } from 'zod';

/**
 * A widget formula, parsed. The language is closed: arithmetic, comparisons, references into the
 * widget state and the functions in `formulaFunctions`. It has no loops, no user functions and no
 * I/O, so a layout an agent wrote cannot run code (ADR 0043).
 */
export type Formula =
	| { readonly kind: 'number'; readonly value: number }
	| { readonly kind: 'string'; readonly value: string }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'null' }
	/** `@/path`: a JSON Pointer into the widget state. */
	| { readonly kind: 'reference'; readonly pointer: string }
	/** A name a function binds for its body, such as `i` inside `series`. */
	| { readonly kind: 'variable'; readonly name: string }
	| { readonly kind: 'member'; readonly target: Formula; readonly field: string }
	| { readonly kind: 'unary'; readonly operator: '-' | 'not'; readonly operand: Formula }
	| {
			readonly kind: 'binary';
			readonly operator: FormulaOperator;
			readonly left: Formula;
			readonly right: Formula;
	  }
	| { readonly kind: 'call'; readonly name: FormulaFunction; readonly args: readonly Formula[] }
	| { readonly kind: 'object'; readonly fields: readonly (readonly [string, Formula])[] }
	| { readonly kind: 'list'; readonly items: readonly Formula[] };

export type FormulaOperator =
	'+' | '-' | '*' | '/' | '%' | '^' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';

interface FormulaFunctionDefinition {
	readonly min: number;
	readonly max: number;
	/** The argument evaluated once per element, and the names it may use. */
	readonly body?: { readonly index: number; readonly names: readonly string[] };
	readonly usage: string;
}

/** Every function a formula may call. The parser refuses any other name. */
export const formulaFunctions = {
	round: { min: 1, max: 2, usage: '`round(x)`, `round(x, digits)`' },
	floor: { min: 1, max: 1, usage: '`floor(x)`' },
	ceil: { min: 1, max: 1, usage: '`ceil(x)`' },
	abs: { min: 1, max: 1, usage: '`abs(x)`' },
	min: { min: 1, max: 20, usage: '`min(a, b, …)` or `min(list)`' },
	max: { min: 1, max: 20, usage: '`max(a, b, …)` or `max(list)`' },
	if: { min: 3, max: 3, usage: '`if(condition, then, else)`' },
	sum: { min: 1, max: 1, usage: '`sum(list)` of numbers' },
	avg: { min: 1, max: 1, usage: '`avg(list)` of numbers' },
	count: { min: 1, max: 1, usage: '`count(list)`' },
	first: { min: 1, max: 1, usage: '`first(list)`' },
	last: { min: 1, max: 1, usage: '`last(list)`' },
	format: {
		min: 1,
		max: 2,
		usage: '`format(x, digits)`: the number as text, with thousands separators'
	},
	series: {
		min: 3,
		max: 3,
		body: { index: 2, names: ['i'] },
		usage:
			'`series(from, to, body)`: a list with `body` evaluated for each whole number `i` from `from` to `to`'
	},
	map: {
		min: 2,
		max: 2,
		body: { index: 1, names: ['item', 'i'] },
		usage: '`map(list, body)`: `body` for each `item`, at position `i`'
	},
	filter: {
		min: 2,
		max: 2,
		body: { index: 1, names: ['item', 'i'] },
		usage: '`filter(list, condition)`: the items for which `condition` is true'
	}
} as const satisfies Record<string, FormulaFunctionDefinition>;

export type FormulaFunction = keyof typeof formulaFunctions;

export type FormulaParse =
	| { readonly kind: 'parsed'; readonly formula: Formula; readonly references: readonly string[] }
	| { readonly kind: 'failure'; readonly message: string };

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

const describe = (token: Token) => (token.kind === 'end' ? 'the end' : `"${token.value}"`);

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
		if (rest.kind !== 'end') this.fail(`Unexpected ${describe(rest)}`, rest.at);
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
			this.fail(`Expected "${value}" but found ${describe(token)}`, token.at);
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
				return this.fail(`Unexpected ${describe(token)}`, token.at);
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
export const parseFormula = (source: string): FormulaParse => {
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

/** Formula source as a layout stores it. The length bound keeps one prop from becoming a program. */
export const formulaSourceSchema = z
	.string()
	.min(1)
	.max(2000)
	.superRefine((source, context) => {
		const parsed = parseFormula(source);
		if (parsed.kind === 'failure') context.addIssue({ code: 'custom', message: parsed.message });
	});
