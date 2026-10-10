import { describe, expect, it } from 'vitest';
import { createInlineAdmission } from '$lib/server/factories/inline-admission';

describe('InlineSuggestionAdmission', () => {
	it('admits a first request', () => {
		expect(createInlineAdmission().admit('user-1')).toEqual({ allowed: true });
	});

	it('refuses a concurrent request for the same user', () => {
		const throttle = createInlineAdmission();
		throttle.admit('user-1');
		expect(throttle.admit('user-1')).toEqual({
			allowed: false,
			reason: 'busy',
			retryAfterMs: 250
		});
	});

	it('admits another user while one is in flight', () => {
		const throttle = createInlineAdmission();
		throttle.admit('user-1');
		expect(throttle.admit('user-2')).toEqual({ allowed: true });
	});

	it('admits again after release', () => {
		const throttle = createInlineAdmission();
		throttle.admit('user-1');
		throttle.release('user-1');
		expect(throttle.admit('user-1')).toEqual({ allowed: true });
	});

	it('refuses requests past the per-minute budget', () => {
		const throttle = createInlineAdmission({ requestsPerMinute: 2, now: () => 0 });
		throttle.admit('user-1');
		throttle.consume('user-1');
		throttle.release('user-1');
		throttle.admit('user-1');
		throttle.consume('user-1');
		throttle.release('user-1');
		throttle.admit('user-1');
		expect(throttle.consume('user-1')).toEqual({
			allowed: false,
			reason: 'rate_limited',
			retryAfterMs: 60_000
		});
	});

	it('admits again after the budget window rolls over', () => {
		let now = 0;
		const throttle = createInlineAdmission({ requestsPerMinute: 1, now: () => now });
		throttle.admit('user-1');
		throttle.consume('user-1');
		throttle.release('user-1');
		now = 60_001;
		throttle.admit('user-1');
		expect(throttle.consume('user-1')).toEqual({ allowed: true });
	});

	it('does not consume budget when an admitted request is abandoned', () => {
		const throttle = createInlineAdmission({ requestsPerMinute: 1, now: () => 0 });
		throttle.admit('user-1');
		throttle.release('user-1');
		throttle.admit('user-1');
		expect(throttle.consume('user-1')).toEqual({ allowed: true });
	});
});
