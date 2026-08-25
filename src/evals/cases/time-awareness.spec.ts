import { describe, expect, it } from 'vitest';
import {
	hasCreatedRange,
	isReasonableLastMonthStart,
	statesLocalCalendarDate
} from './time-awareness';

describe('time-awareness assertions', () => {
	it('recognizes a correct calendar date wrapped in Markdown emphasis', () => {
		expect(
			statesLocalCalendarDate(
				'Today is **Tuesday, August 25, 2026**.',
				new Date('2026-08-25T12:00:00.000Z'),
				'UTC'
			)
		).toBe(true);
	});

	it('treats nullable structured-output fields as an omitted creation range', () => {
		expect(hasCreatedRange({ createdAfter: null, createdBefore: null })).toBe(false);
	});

	it('detects an active creation range', () => {
		expect(hasCreatedRange({ createdAfter: '2026-07-25T00:00:00Z', createdBefore: null })).toBe(
			true
		);
	});

	it('accepts the previous calendar month as a reading of last month', () => {
		expect(
			isReasonableLastMonthStart('2026-07-01T00:00:00Z', new Date('2026-08-25T12:00:00.000Z'))
		).toBe(true);
	});

	it('rejects a last-month range starting before the previous calendar month', () => {
		expect(
			isReasonableLastMonthStart('2026-06-30T23:59:59Z', new Date('2026-08-25T12:00:00.000Z'))
		).toBe(false);
	});

	it('rejects a last-month range that drops most of the month', () => {
		expect(
			isReasonableLastMonthStart('2026-08-10T00:00:00Z', new Date('2026-08-25T12:00:00.000Z'))
		).toBe(false);
	});
});
