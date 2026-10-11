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

export interface FormulaFunctionDefinition {
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
	group: {
		min: 2,
		max: 2,
		usage:
			'`group(list, "field")`: one `{ key, items }` per distinct value of `field`, in the order first seen'
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

/** Authored formula text; language decisions belong to the widget service. */
export const formulaSourceSchema = z.string().min(1).max(2000);
