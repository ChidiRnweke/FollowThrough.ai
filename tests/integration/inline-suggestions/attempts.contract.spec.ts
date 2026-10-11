import { expect, it } from 'vitest';
import type { DateTime } from '$lib/models/workspace';
import { InlineAttemptRecords } from '$lib/server/repositories/inline-suggestions/postgres/attempts';
import { context, seedUser } from '../database-harness';

const at = (seconds: number) =>
	new Date(Date.parse('2026-07-12T08:00:00.000Z') + seconds * 1000).toISOString() as DateTime;

it('admits exactly the limit when one user reserves concurrently, then frees the window', async () => {
	const owner = await seedUser('41001');
	const records = new InlineAttemptRecords(context.db);
	const concurrent = await Promise.all(
		Array.from({ length: 6 }, () => records.reserve(owner.userId, at(10), at(-50), 3))
	);
	const later = await records.reserve(owner.userId, at(71), at(11), 3);
	expect({
		reserved: concurrent.filter((result) => result.kind === 'reserved').length,
		exhausted: concurrent.find((result) => result.kind === 'exhausted'),
		later
	}).toEqual({
		reserved: 3,
		exhausted: { kind: 'exhausted', oldest: at(10) },
		later: { kind: 'reserved' }
	});
});
