import { z } from 'zod';
import type { RequestHandler } from './$types';

/**
 * Ingest for browser errors caught by `handleError` in hooks.client.ts.
 *
 * The whole implementation is a `console.error`: `scripts/otel-instrumentation.js`
 * bridges `console.*` into the OTel logs pipeline, so this reaches the collector
 * with no exporter wiring of its own. A plain endpoint rather than a remote
 * command because the caller is already in a failure path and must not depend on
 * the remote-function machinery working.
 */

const reportSchema = z.object({
	message: z.string().max(2000),
	stack: z.string().max(8000).optional(),
	route: z.string().max(500).optional(),
	pathname: z.string().max(500).optional(),
	status: z.number().int().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const report = reportSchema.parse(await request.json());
	const where = report.route ?? report.pathname ?? 'unknown route';

	console.error(
		`[client] ${report.message} (${where}${report.status ? ` status=${report.status}` : ''}${
			locals.user ? ` user=${locals.user.id}` : ''
		})${report.stack ? `\n${report.stack}` : ''}`
	);

	// Nothing to say back — the client neither waits for nor reads this.
	return new Response(null, { status: 204 });
};
