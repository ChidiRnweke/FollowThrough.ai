import { Ajv, type ErrorObject, type Options, type ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { RE2JS } from 're2js';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';

/**
 * Compiles a connector tool's input schema, which a third party wrote (ADR 0049).
 *
 * - The dialect follows MCP 2025-11-25: a schema without `$schema` is JSON Schema
 *   2020-12, draft-07 is also accepted, and any other dialect is rejected.
 * - `pattern` and `patternProperties` run on RE2, which matches in linear time,
 *   so a crafted pattern cannot stall validation the way a backtracking engine can.
 * - Every compile gets its own Ajv instance: Ajv caches schemas by `$id`, and a
 *   shared instance would let one server's schema shadow another's.
 */
export type ArgumentCheck =
	{ readonly kind: 'valid' } | { readonly kind: 'invalid'; readonly problems: readonly string[] };

export type SchemaCompilation =
	| { readonly kind: 'compiled'; readonly check: (value: AgentPayload) => ArgumentCheck }
	| { readonly kind: 'failure'; readonly reason: string };

const DRAFT_07 = new Set([
	'http://json-schema.org/draft-07/schema',
	'http://json-schema.org/draft-07/schema#',
	'https://json-schema.org/draft-07/schema',
	'https://json-schema.org/draft-07/schema#'
]);
const DRAFT_2020_12 = new Set([
	'https://json-schema.org/draft/2020-12/schema',
	'https://json-schema.org/draft/2020-12/schema#'
]);

/**
 * Ajv keys its pattern cache by `toString()`, so each compiled pattern must name
 * its own source; RE2JS objects do not, and without this every pattern in a
 * schema would reuse the first one.
 */
type RegExpEngine = NonNullable<NonNullable<Options['code']>['regExp']>;

const re2: RegExpEngine = Object.assign(
	(pattern: string, flags: string) => {
		const compiled = RE2JS.compile(pattern);
		return {
			test: (input: string) => compiled.test(input),
			toString: () => `/${pattern}/${flags}`
		};
	},
	{ code: 'RE2JS.compile' }
);

const options: Options = {
	strict: false,
	allErrors: true,
	validateSchema: true,
	code: { regExp: re2 }
};

const describe = (error: ErrorObject): string =>
	`${error.instancePath === '' ? 'arguments' : `arguments${error.instancePath}`} ${error.message ?? 'is invalid'}`;

export const compileJsonSchema = (schema: AgentPayloadObject): SchemaCompilation => {
	const dialect = schema.$schema;
	if (dialect !== undefined && typeof dialect !== 'string')
		return {
			kind: 'failure',
			reason: 'The schema names its dialect with something other than a URI.'
		};
	const ajv =
		dialect === undefined || DRAFT_2020_12.has(dialect)
			? new Ajv2020(options)
			: DRAFT_07.has(dialect)
				? new Ajv(options)
				: undefined;
	if (!ajv) return { kind: 'failure', reason: `The schema dialect ${dialect} is not supported.` };
	addFormats(ajv);
	let validate: ValidateFunction;
	try {
		validate = ajv.compile(schema);
	} catch (error) {
		return {
			kind: 'failure',
			reason: `The schema does not compile: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	return {
		kind: 'compiled',
		check: (value) =>
			validate(value)
				? { kind: 'valid' }
				: { kind: 'invalid', problems: (validate.errors ?? []).map(describe) }
	};
};
