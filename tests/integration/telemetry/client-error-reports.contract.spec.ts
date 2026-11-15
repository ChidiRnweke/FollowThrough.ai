import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import type {
	ClientErrorFingerprint,
	ClientErrorReservation
} from '$lib/server/repositories/telemetry';
import type { DateTime } from '$lib/models/workspace';
import { clientErrorReports } from '$lib/server/db/schema/telemetry';
import { ClientErrorReportRecords } from '$lib/server/repositories/telemetry/postgres/client-error-reports';
import { context, seedUser } from '../database-harness';

const at = (seconds: number) =>
	new Date(Date.parse('2026-11-15T08:00:00.000Z') + seconds * 1000).toISOString() as DateTime;

const fingerprint = (message: string) => `${message}\u0000at render` as ClientErrorFingerprint;

/** Runs each reservation on its own connection, so they really overlap in Postgres. */
const concurrently = async (
	owner: ActorContext,
	messages: readonly string[],
	limit: number
): Promise<ClientErrorReservation[]> => {
	const connections = messages.map(() => connectPostgresTestDatabase(context.url));
	try {
		return await Promise.all(
			messages.map((message, index) =>
				new ClientErrorReportRecords(owner, connections[index].db).reserve(
					fingerprint(message),
					at(10),
					at(-50),
					limit
				)
			)
		);
	} finally {
		await Promise.all(connections.map((connection) => connection.close()));
	}
};

it('admits exactly the limit when one user reports concurrently, apart from another user', async () => {
	const owner = await seedUser('51001');
	const neighbour = await seedUser('51002');
	await new ClientErrorReportRecords(neighbour, context.db).reserve(
		fingerprint('neighbour'),
		at(10),
		at(-50),
		3
	);
	const concurrent = await concurrently(
		owner,
		Array.from({ length: 6 }, (_, index) => `failure ${index}`),
		3
	);
	expect({
		reserved: concurrent.filter((result) => result.kind === 'reserved').length,
		exhausted: concurrent.find((result) => result.kind === 'exhausted')
	}).toEqual({ reserved: 3, exhausted: { kind: 'exhausted', oldest: at(10) } });
});

it('admits one of several concurrent repeats and drops the rest', async () => {
	const owner = await seedUser('51003');
	const concurrent = await concurrently(owner, ['loop', 'loop', 'loop', 'loop'], 20);
	expect(concurrent.map((result) => result.kind).toSorted()).toEqual([
		'duplicate',
		'duplicate',
		'duplicate',
		'reserved'
	]);
});

it('carries dropped repeats to the next admission after their report has left the window', async () => {
	const owner = await seedUser('51004');
	const records = new ClientErrorReportRecords(owner, context.db);
	await records.reserve(fingerprint('loop'), at(0), at(-60), 20);
	await records.reserve(fingerprint('loop'), at(1), at(-59), 20);
	await records.reserve(fingerprint('loop'), at(2), at(-58), 20);
	const carried = await records.reserve(fingerprint('other'), at(70), at(10), 20);
	const next = await records.reserve(fingerprint('later'), at(71), at(11), 20);
	const rows = await context.db
		.select({
			reportedAt: clientErrorReports.reportedAt,
			suppressed: clientErrorReports.suppressed
		})
		.from(clientErrorReports)
		.where(eq(clientErrorReports.userId, owner.userId))
		.orderBy(clientErrorReports.reportedAt);
	expect({ carried, next, rows }).toEqual({
		carried: { kind: 'reserved', suppressed: 2 },
		next: { kind: 'reserved', suppressed: 0 },
		rows: [
			{ reportedAt: new Date(at(70)), suppressed: 0 },
			{ reportedAt: new Date(at(71)), suppressed: 0 }
		]
	});
});
