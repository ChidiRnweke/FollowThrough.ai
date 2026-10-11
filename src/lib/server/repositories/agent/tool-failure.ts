import { z } from 'zod';
import { toolFailureSchema, type ToolFailure } from '$lib/models/agent/tool-failure';

/**
 * What a tool output says about itself.
 *
 * `corrupt` is a value claiming the reserved failure kind that does not match
 * the envelope. It is still a failure — reporting it as success is the quiet
 * wrong answer — but reading it must not throw: the reader sits on the stream a
 * run is recorded from, and a throw there ends a turn the SDK had already
 * recovered.
 */
export type ToolOutputReading =
	| { readonly kind: 'success' }
	| { readonly kind: 'failure'; readonly failure: ToolFailure }
	| { readonly kind: 'corrupt'; readonly message: string };

const parseJsonText = (
	text: string
): { readonly kind: 'json'; readonly value: unknown } | { readonly kind: 'corrupt' } => {
	try {
		return { kind: 'json', value: JSON.parse(text) };
	} catch {
		return { kind: 'corrupt' };
	}
};

/** Parse only the current envelope; key order is immaterial. Plain text is a success. */
export const readToolOutput = (output: unknown): ToolOutputReading => {
	let value: unknown = output;
	if (typeof output === 'string') {
		if (!output.trimStart().startsWith('{')) return { kind: 'success' };
		const parsed = parseJsonText(output);
		// Text that only looks like JSON is still a plain-text result.
		if (parsed.kind === 'corrupt') return { kind: 'success' };
		value = parsed.value;
	}
	if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'failure')
		return { kind: 'success' };
	const failure = toolFailureSchema.safeParse(value);
	return failure.success
		? { kind: 'failure', failure: failure.data }
		: { kind: 'corrupt', message: z.prettifyError(failure.error) };
};
