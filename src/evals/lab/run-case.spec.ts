import { describe, expect, it } from 'vitest';
import { evalCaseDeadlineMs } from './run-case';

describe('eval case deadline', () => {
	it('accepts an explicit positive deadline', () => {
		expect(evalCaseDeadlineMs('1250')).toBe(1250);
	});

	it('rejects a non-positive deadline', () => {
		expect(() => evalCaseDeadlineMs('0')).toThrow('must be a positive number');
	});
});
