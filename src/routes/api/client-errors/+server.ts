// chisel-ignore-file error-flow:raw-http-status -- A one-way browser telemetry beacon succeeds with an intentionally empty 204 response.
import { json } from '@sveltejs/kit';
import {
	clientErrorReportSchema,
	type ClientErrorReport
} from '$lib/models/telemetry/client-error';
import { requestBodyLimits } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';
import { readBoundedText } from '$lib/server/infrastructure/http/bounded-body';
import { logRefusal } from '$lib/server/infrastructure/http/refusal-log';
import type { RequestHandler } from './$types';

/**
 * Ingest for browser errors caught by `handleError` in hooks.client.ts. A plain endpoint rather
 * than a remote command because the caller is already in a failure path and must not depend on
 * the remote-function machinery working. The browser neither waits for nor reads the answer.
 */

const readReport = (
	text: string
): { kind: 'report'; report: ClientErrorReport } | { kind: 'failure'; description: string } => {
	try {
		const parsed = clientErrorReportSchema.safeParse(JSON.parse(text));
		return parsed.success
			? { kind: 'report', report: parsed.data }
			: { kind: 'failure', description: 'The report is not a client error report.' };
	} catch {
		return { kind: 'failure', description: 'The report is not JSON.' };
	}
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const limit = requestBodyLimits().clientErrorReport;
	const body = await readBoundedText(request, limit);
	if (body.kind === 'failure' && body.reason === 'interrupted') {
		logRefusal(url.pathname, 'interrupted');
		return json({ message: 'The report body could not be read.' }, { status: 400 });
	}
	if (body.kind === 'failure') {
		logRefusal(url.pathname, 'too_large');
		return json({ message: `The report is larger than ${limit} bytes.` }, { status: 413 });
	}
	const read = readReport(body.text);
	if (read.kind === 'failure') {
		logRefusal(url.pathname, read.description);
		return json({ message: read.description }, { status: 400 });
	}

	const admission = await AppFactory.forActor(AppFactory.actor(locals))
		.telemetry()
		.reportClientError(read.report);
	if (admission.kind === 'rate_limited') {
		const retryAfterSeconds = Math.max(1, Math.ceil(admission.retryAfterMs / 1_000));
		return json(admission, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
	}
	return new Response(null, { status: 204 });
};
