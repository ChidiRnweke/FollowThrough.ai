import type { z } from 'zod';
import type { WidgetIssue } from '$lib/models/widgets';

export type JsonTextRead<T> =
	| { readonly kind: 'read'; readonly value: T }
	| { readonly kind: 'failure'; readonly issues: readonly WidgetIssue[] };

/**
 * Read JSON someone typed into a widget editor. Text is outside input, so it is parsed here, at
 * the browser edge, into the model type or the problems that stop it, each with a JSON Pointer.
 */
export const readJsonText = <T>(
	text: string,
	schema: z.ZodType<T>,
	part: string
): JsonTextRead<T> => {
	try {
		const parsed: unknown = JSON.parse(text);
		const result = schema.safeParse(parsed);
		if (result.success) return { kind: 'read', value: result.data };
		return {
			kind: 'failure',
			issues: result.error.issues.map((issue) => ({
				path: [`/${part}`, ...issue.path.map(String)].join('/'),
				message: issue.message
			}))
		};
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		return { kind: 'failure', issues: [{ path: `/${part}`, message: error.message }] };
	}
};
