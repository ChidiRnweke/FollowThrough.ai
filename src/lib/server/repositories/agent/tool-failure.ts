import { toolFailureSchema } from '$lib/models/agent/tool-failure';

/** Parse only the current envelope; key order is immaterial. */
export const readToolFailure = (output: unknown): string | undefined => {
	const value: unknown =
		typeof output === 'string' && output.trimStart().startsWith('{') ? JSON.parse(output) : output;
	if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'failure')
		return undefined;
	return toolFailureSchema.parse(value).message;
};
