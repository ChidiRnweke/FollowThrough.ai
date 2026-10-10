import { expect, it } from 'vitest';
import { InlineAdmissionRules } from './inline-admission';

it('expires a request exactly at the budget window boundary', () => {
	const rules = new InlineAdmissionRules(1);
	expect(rules.consume([0], 60_000)).toEqual({ admission: { allowed: true }, recent: [60_000] });
});
it('calculates retry eligibility from the oldest unexpired request', () => {
	const rules = new InlineAdmissionRules(2);
	expect(rules.consume([0, 30_000, 45_000], 60_000)).toEqual({
		admission: { allowed: false, reason: 'rate_limited', retryAfterMs: 30_000 },
		recent: [30_000, 45_000]
	});
});
