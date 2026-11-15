import { expect, it } from 'vitest';
import type { UserId } from '$lib/models/identity';
import type { ClientErrorReport } from '$lib/models/telemetry/client-error';
import type { DateTime } from '$lib/models/workspace';
import { ClientErrorAdmissionService } from '$lib/server/services/telemetry/client-error-admission';
import { InMemoryClientErrorReports } from '$lib/testing/telemetry/fakes/in-memory-client-error-reports';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { Telemetry, type TelemetryDependencies } from './controller';

const setup = (reportsPerWindow: number) => {
	const logged: { userId: UserId; report: ClientErrorReport; suppressed: number }[] = [];
	let seconds = 0;
	const controller = new Telemetry(
		testActor(),
		capabilityDependencies<TelemetryDependencies>({
			budget: new ClientErrorAdmissionService(new InMemoryClientErrorReports(), {
				reportsPerWindow,
				windowMs: 60_000
			}),
			log: (userId, report, suppressed) => logged.push({ userId, report, suppressed }),
			now: () => {
				seconds += 1;
				return new Date(
					Date.parse('2026-11-15T08:00:00.000Z') + seconds * 1000
				).toISOString() as DateTime;
			}
		})
	);
	return { controller, logged };
};

const loop: ClientErrorReport = {
	message: 'TypeError: x is undefined',
	stack: 'at render',
	status: 500
};
const other: ClientErrorReport = { message: 'RangeError: too deep', pathname: '/today' };

it('logs each admitted report once, with the repeats dropped before it', async () => {
	const { controller, logged } = setup(20);
	const results = [
		await controller.reportClientError(loop),
		await controller.reportClientError(loop),
		await controller.reportClientError(other)
	];
	expect({ results, logged }).toEqual({
		results: [
			{ kind: 'accepted', suppressed: 0 },
			{ kind: 'duplicate' },
			{ kind: 'accepted', suppressed: 1 }
		],
		logged: [
			{ userId: testActor().userId, report: loop, suppressed: 0 },
			{ userId: testActor().userId, report: other, suppressed: 1 }
		]
	});
});

it('logs nothing for a report past the budget and says when to retry', async () => {
	const { controller, logged } = setup(1);
	await controller.reportClientError(loop);
	const refused = await controller.reportClientError(other);
	expect({ refused, logged: logged.length }).toEqual({
		refused: { kind: 'rate_limited', retryAfterMs: 59_000 },
		logged: 1
	});
});
