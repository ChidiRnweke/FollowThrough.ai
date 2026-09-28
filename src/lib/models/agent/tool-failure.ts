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

/** Parse only the current envelope; key order is immaterial. */
// audit-allow: no-unknown-type — Reads a tool output at the protocol/replay boundary.
export const readToolFailure = (output: unknown): string | undefined => {
	const value: unknown =
		typeof output === 'string' && output.trimStart().startsWith('{') ? JSON.parse(output) : output;
	if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'failure')
		return undefined;
	return toolFailureSchema.parse(value).message;
};
