import { z } from 'zod';

/** The sole model-facing failure contract for chat and MCP tools. */
export const toolFailureSchema = z
	.object({
		kind: z.literal('failure'),
		code: z.enum([
			'VALIDATION',
			'NOT_FOUND',
			'OWNERSHIP',
			'CONFLICT',
			'STALE_REVISION',
			'INVALID_TRANSITION',
			'EXPIRED_SUGGESTION',
			'UNSUPPORTED_DIAGRAM_OPERATION',
			'EXTERNAL_SERVICE',
			'INVALID_GENERATED_CONTENT',
			'INTERNAL_ERROR',
			'TOOL_NOT_AVAILABLE',
			'APPROVAL_REJECTED',
			'STALE_REVIEW',
			'NOTE_REVIEW_FAILED',
			'path_not_found',
			'path_is_directory',
			'empty_file',
			'range_starts_after_eof',
			'range_ends_before_start',
			'invalid_pattern'
		]),
		message: z.string().min(1),
		recovery: z.string().min(1),
		details: z.record(z.string(), z.json())
	})
	.strict();

export type ToolFailure = z.infer<typeof toolFailureSchema>;

export const toolFailure = (
	code: ToolFailure['code'],
	message: string,
	recovery: string,
	details: ToolFailure['details'] = {}
): ToolFailure => ({ kind: 'failure', code, message, recovery, details });

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
	// audit-allow: no-unknown-type — JSON text decoded at the protocol/replay boundary.
): { readonly kind: 'json'; readonly value: unknown } | { readonly kind: 'corrupt' } => {
	try {
		return { kind: 'json', value: JSON.parse(text) };
	} catch {
		return { kind: 'corrupt' };
	}
};

/** Parse only the current envelope; key order is immaterial. Plain text is a success. */
// audit-allow: no-unknown-type — Reads a tool output at the protocol/replay boundary.
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
