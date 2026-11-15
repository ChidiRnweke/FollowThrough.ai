import { expect, it } from 'vitest';
import type { ClientErrorReport } from '$lib/models/telemetry/client-error';
import type { DateTime } from '$lib/models/workspace';
import { InMemoryClientErrorReports } from '$lib/testing/telemetry/fakes/in-memory-client-error-reports';
import { ClientErrorAdmissionService } from './client-error-admission';

const at = (seconds: number) =>
	new Date(Date.parse('2026-11-15T08:00:00.000Z') + seconds * 1000).toISOString() as DateTime;

const report = (
	message: string,
	stack = `Error: ${message}\n    at render`
): ClientErrorReport => ({
	message,
	stack
});

const budget = (reportsPerWindow: number) =>
	new ClientErrorAdmissionService(new InMemoryClientErrorReports(), {
		reportsPerWindow,
		windowMs: 60_000
	});

it('refuses a report past the budget until the oldest admitted report leaves the window', async () => {
	const admission = budget(2);
	const results = [
		await admission.admit(report('first'), at(0)),
		await admission.admit(report('second'), at(10)),
		await admission.admit(report('third'), at(20))
	];
	expect(results).toEqual([
		{ kind: 'accepted', suppressed: 0 },
		{ kind: 'accepted', suppressed: 0 },
		{ kind: 'rate_limited', retryAfterMs: 40_000 }
	]);
});

it('drops a repeat inside the window and counts it on the next admitted report', async () => {
	const admission = budget(20);
	const results = [
		await admission.admit(report('loop'), at(0)),
		await admission.admit(report('loop'), at(1)),
		await admission.admit(report('loop'), at(2)),
		await admission.admit(report('other'), at(3)),
		await admission.admit(report('later'), at(4))
	];
	expect(results).toEqual([
		{ kind: 'accepted', suppressed: 0 },
		{ kind: 'duplicate' },
		{ kind: 'duplicate' },
		{ kind: 'accepted', suppressed: 2 },
		{ kind: 'accepted', suppressed: 0 }
	]);
});

it('treats the same message with another stack as a different failure', async () => {
	const admission = budget(20);
	await admission.admit(report('same', 'at a'), at(0));
	expect(await admission.admit(report('same', 'at b'), at(1))).toEqual({
		kind: 'accepted',
		suppressed: 0
	});
});

it('does not spend the budget on a dropped repeat', async () => {
	const admission = budget(2);
	await admission.admit(report('loop'), at(0));
	await admission.admit(report('loop'), at(1));
	expect(await admission.admit(report('other'), at(2))).toEqual({
		kind: 'accepted',
		suppressed: 1
	});
});

it('admits a repeat again once its first report has left the window', async () => {
	const admission = budget(20);
	await admission.admit(report('loop'), at(0));
	expect(await admission.admit(report('loop'), at(61))).toEqual({
		kind: 'accepted',
		suppressed: 0
	});
});
