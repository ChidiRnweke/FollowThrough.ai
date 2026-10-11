import { expect, it } from 'vitest';
import type { UserId } from '$lib/models/identity';
import { InMemoryInlineAttempts } from '$lib/testing/inline-suggestions/fakes/inline-attempts';
import { InlineAdmissionService } from './inline-admission';

const user = '00000000-0000-4000-8000-000000000001' as UserId;
const minute = Date.parse('2026-07-12T08:00:00.000Z');

it('expires an attempt exactly at the budget window boundary', async () => {
	const admission = new InlineAdmissionService(new InMemoryInlineAttempts(), 1);
	await admission.consume(user, minute);
	expect(await admission.consume(user, minute + 60_000)).toEqual({ allowed: true });
});

it('calculates retry eligibility from the oldest attempt still in the window', async () => {
	const admission = new InlineAdmissionService(new InMemoryInlineAttempts(), 2);
	for (const offset of [10_000, 30_000]) await admission.consume(user, minute + offset);
	expect(await admission.consume(user, minute + 60_000)).toEqual({
		allowed: false,
		reason: 'rate_limited',
		retryAfterMs: 10_000
	});
});
