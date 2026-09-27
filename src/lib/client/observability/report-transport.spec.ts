import { expect, it } from 'vitest';
import { clientErrorReportSchema } from '$lib/models/telemetry/client-error';
import { serializeClientErrorReport } from './report-error';

it('keeps an oversized browser failure acceptable to the ingestion endpoint', () => {
	const failure = new Error('Failed to render document: ' + 'content '.repeat(400));
	failure.stack =
		'Error: failed to render\n' + '    at render (https://example.test/app.js:1:1)\n'.repeat(250);
	const body = serializeClientErrorReport({
		message: failure.message,
		stack: failure.stack,
		route: '/(app)/' + 'segment/'.repeat(100),
		pathname: '/notes/' + 'segment/'.repeat(100),
		status: 500
	});
	expect(clientErrorReportSchema.safeParse(JSON.parse(body)).success).toBe(true);
});

it('marks shortened diagnostics while preserving the original failure prefix', () => {
	const body = serializeClientErrorReport({
		message: 'Document rendering failed: ' + 'x'.repeat(2100)
	});
	expect(JSON.parse(body)).toEqual({
		message: expect.stringMatching(/^Document rendering failed: x+ \[truncated\]$/)
	});
});

it('preserves a report that already fits the ingestion contract', () => {
	const report = {
		message: 'Could not render diagram',
		stack: 'Error: diagram\n at render',
		pathname: '/today',
		status: 500
	};
	expect(JSON.parse(serializeClientErrorReport(report))).toEqual(report);
});
