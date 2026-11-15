import { describe, expect, it } from 'vitest';
import { RunAdmissionRules } from './admission';

const rules = new RunAdmissionRules({ perAccount: 5, total: 50 });

describe('run admission', () => {
	it('admits a run while both counts are under their limits', () => {
		expect(rules.admit({ account: 4, total: 49 })).toEqual({ kind: 'admitted' });
	});

	it("refuses a run once the account's executing runs reach its limit", () => {
		expect(rules.admit({ account: 5, total: 5 })).toEqual({
			kind: 'refused',
			limit: 'account',
			executing: 5
		});
	});

	it("refuses a run once the deployment's executing runs reach the total", () => {
		expect(rules.admit({ account: 0, total: 50 })).toEqual({
			kind: 'refused',
			limit: 'total',
			executing: 50
		});
	});

	it("names the account's limit when both are reached, because its owner can act on it", () => {
		expect(rules.admit({ account: 5, total: 50 })).toEqual({
			kind: 'refused',
			limit: 'account',
			executing: 5
		});
	});
});
