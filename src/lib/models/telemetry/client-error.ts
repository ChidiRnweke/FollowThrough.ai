import { z } from 'zod';

/** Existing ingestion limits, shared with the browser transport. */
export const CLIENT_ERROR_LIMITS = {
	message: 2000,
	stack: 8000,
	route: 500,
	pathname: 500
} as const;

export const clientErrorReportSchema = z.object({
	message: z.string().max(CLIENT_ERROR_LIMITS.message),
	stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
	route: z.string().max(CLIENT_ERROR_LIMITS.route).optional(),
	pathname: z.string().max(CLIENT_ERROR_LIMITS.pathname).optional(),
	status: z.number().int().optional()
});

/** A browser failure and whichever diagnostic context its caller has available. */
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
