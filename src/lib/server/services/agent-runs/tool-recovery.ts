import { z } from 'zod';
import { suggestToolNames } from '$lib/utils';

export const useToolEnvelopeSchema = z
	.object({
		name: z.string().min(1),
		payload: z.record(z.string(), z.unknown()).optional()
	})
	.strict();

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
}

const issuesFrom = (error: z.ZodError) =>
	error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join('.') : '$',
		message: issue.message
	}));

export const invalidUseToolEnvelope = (error?: z.ZodError): RecoverableUseToolFailure => ({
	failure: 'Invalid use_tool input.',
	recovery:
		'Call use_tool with {"name":"<exact search_tools name>","payload":{...}}. Do not nest the object under "arguments" and do not JSON-stringify the payload.',
	...(error ? { issues: issuesFrom(error) } : {})
});

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

export const invalidUseToolPayload = (
	name: string,
	error: z.ZodError,
	inputSchema: unknown
): RecoverableUseToolFailure => ({
	failure: `Invalid payload for "${name}".`,
	recovery: `Retry use_tool with name "${name}" and make payload match input_schema.`,
	issues: issuesFrom(error),
	input_schema: inputSchema
});
