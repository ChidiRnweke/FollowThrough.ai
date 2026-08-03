import { z } from 'zod';
import { suggestToolNames } from '$lib/models/agent/tool-name-matching';

const payloadObject = z.record(z.string(), z.unknown());

/**
 * `payload` is the documented shape, but some models never populate a nested
 * object and instead emit the arguments as a flat JSON string — the one shape
 * every model fills reliably. Accepting both here turns a dead-end tool call
 * into a working one; `resolveUseToolPayload` normalises the two.
 */
export const useToolEnvelopeSchema = z
	.object({
		name: z.string().min(1),
		payload: payloadObject.optional(),
		arguments: z.union([payloadObject, z.string()]).optional()
	})
	.strict();

export type UseToolEnvelope = z.infer<typeof useToolEnvelopeSchema>;

export interface RecoverableToolSuggestion {
	readonly name: string;
	readonly invokeVia: 'use_tool';
}

export interface RecoverableUseToolFailure {
	readonly failure: string;
	readonly recovery: string;
	readonly suggestions?: readonly RecoverableToolSuggestion[];
	readonly issues?: readonly { readonly path: string; readonly message: string }[];
	readonly input_schema?: unknown;
	readonly example?: unknown;
}

const issuesFrom = (error: z.ZodError) =>
	error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join('.') : '$',
		message: issue.message
	}));

export const invalidUseToolEnvelope = (error?: z.ZodError): RecoverableUseToolFailure => ({
	failure: 'Invalid use_tool input.',
	recovery:
		'Call use_tool with {"name":"<exact search_tools name>","payload":{...}} where payload carries every required argument the tool\'s input_schema lists. If you cannot build that nested object, send the same arguments as a JSON string in "arguments" instead.',
	...(error ? { issues: issuesFrom(error) } : {})
});

/**
 * Normalises the two accepted argument shapes into one record. An empty
 * envelope is reported as a missing payload rather than an empty one, because
 * that is the failure models actually hit and the recovery text differs.
 */
export const resolveUseToolPayload = (
	envelope: UseToolEnvelope
): { readonly ok: true; readonly payload: Record<string, unknown> } | { readonly ok: false } => {
	if (envelope.payload) return { ok: true, payload: envelope.payload };
	const flat = envelope.arguments;
	if (flat === undefined) return { ok: false };
	if (typeof flat !== 'string') return { ok: true, payload: flat };
	try {
		const parsed: unknown = JSON.parse(flat);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
			return { ok: false };
		return { ok: true, payload: parsed as Record<string, unknown> };
	} catch {
		return { ok: false };
	}
};

export const unknownUseToolName = (
	name: string,
	candidates: readonly string[]
): RecoverableUseToolFailure => {
	const suggestions = suggestToolNames(name, candidates).map((suggestion) => ({
		name: suggestion.name,
		invokeVia: 'use_tool' as const
	}));
	return {
		failure:
			suggestions.length > 0
				? `No tool named "${name}". Did you mean ${suggestions
						.map((suggestion) => `"${suggestion.name}"`)
						.join(', ')}?`
				: `No tool named "${name}".`,
		recovery:
			suggestions.length > 0
				? 'Retry use_tool with one exact suggested name and put that tool arguments directly under payload. Suggestions are never executed automatically.'
				: 'Call search_tools to discover the capability, then invoke an exact returned name through use_tool.',
		...(suggestions.length > 0 ? { suggestions } : {})
	};
};

interface JsonSchemaShape {
	readonly required?: readonly string[];
	readonly properties?: Readonly<Record<string, { readonly type?: string }>>;
}

/**
 * A filled-in payload for the required fields, so a model that cannot infer
 * structure from the schema has a literal to copy. Placeholder values name what
 * belongs there rather than pretending to be real data.
 */
const exampleFrom = (inputSchema: unknown): Record<string, unknown> | undefined => {
	const schema = inputSchema as JsonSchemaShape | undefined;
	if (!schema?.required?.length) return undefined;
	return Object.fromEntries(
		schema.required.map((field) => {
			const type = schema.properties?.[field]?.type;
			if (type === 'number' || type === 'integer') return [field, 0];
			if (type === 'boolean') return [field, false];
			if (type === 'array') return [field, []];
			if (type === 'object') return [field, {}];
			return [field, `<${field}>`];
		})
	);
};

/**
 * Escalates with the attempt count. Repeating the same schema at a model that
 * has already ignored it twice only burns turns, so the third attempt stops
 * offering the same path and sends it to the directly callable tool instead.
 */
export const invalidUseToolPayload = (
	name: string,
	error: z.ZodError,
	inputSchema: unknown,
	attempt = 1
): RecoverableUseToolFailure => {
	const required = (inputSchema as JsonSchemaShape | undefined)?.required;
	const example = exampleFrom(inputSchema);
	if (attempt >= 3)
		return {
			failure: `Invalid payload for "${name}" on ${attempt} consecutive attempts.`,
			recovery: `Stop calling use_tool for "${name}". It is now available as a top-level tool: call "${name}" directly with its arguments as flat top-level fields. If you cannot supply them, tell the user what is missing instead of retrying.`,
			issues: issuesFrom(error),
			...(example ? { example } : {})
		};
	if (attempt === 2)
		return {
			failure: `Invalid payload for "${name}" again — the payload was empty or incomplete both times.`,
			recovery: example
				? `Copy this shape and replace the placeholders with real values: {"name":"${name}","payload":${JSON.stringify(example)}}. "${name}" is also callable directly as a top-level tool with those same fields.`
				: `Retry use_tool with name "${name}" and a payload matching input_schema, or call "${name}" directly as a top-level tool.`,
			issues: issuesFrom(error),
			input_schema: inputSchema,
			...(example ? { example } : {})
		};
	return {
		failure: `Invalid payload for "${name}".`,
		recovery: required?.length
			? `Retry use_tool with name "${name}" and a payload that includes the required field${required.length > 1 ? 's' : ''} ${required.join(', ')} from the input_schema.`
			: `Retry use_tool with name "${name}" and make payload match input_schema.`,
		issues: issuesFrom(error),
		input_schema: inputSchema,
		...(example ? { example } : {})
	};
};

/** Key-order-independent, so two spellings of the same payload count as one attempt. */
const stableStringify = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0
	);
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
};

/**
 * Counts identical invalid attempts within one run so `invalidUseToolPayload`
 * can escalate. Keyed on the tool and the payload, because a model correcting
 * its payload is making progress and should not be cut off.
 */
export const createUseToolAttempts = (): {
	record(name: string, payload: unknown): number;
} => {
	const counts = new Map<string, number>();
	return {
		record(name, payload) {
			const key = `${name}:${stableStringify(payload)}`;
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return next;
		}
	};
};
