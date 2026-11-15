import { z } from 'zod';

/**
 * Existing ingestion limits, shared with the browser transport. `CLIENT_ERROR_MAX_BODY_BYTES`
 * in `config.ts` is derived from them.
 */
export const CLIENT_ERROR_LIMITS = {
	message: 2000,
	stack: 8000,
	route: 500,
	pathname: 500
} as const;

export const clientErrorReportSchema = z
	.object({
		message: z.string().max(CLIENT_ERROR_LIMITS.message),
		stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
		route: z.string().max(CLIENT_ERROR_LIMITS.route).optional(),
		pathname: z.string().max(CLIENT_ERROR_LIMITS.pathname).optional(),
		// RFC 9110 §15: a status code is a three-digit integer from 100 to 599.
		status: z.number().int().min(100).max(599).optional()
	})
	.strict();

/** A browser failure and whichever diagnostic context its caller has available. */
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

/**
 * What the server did with a report. An accepted report is written to the log with the number
 * of repeats suppressed since the user's previous accepted report; a repeat is dropped; a report
 * past the user's budget is refused until the oldest counted report leaves the window.
 */
export type ClientErrorAdmission =
	| { readonly kind: 'accepted'; readonly suppressed: number }
	| { readonly kind: 'duplicate' }
	| { readonly kind: 'rate_limited'; readonly retryAfterMs: number };
