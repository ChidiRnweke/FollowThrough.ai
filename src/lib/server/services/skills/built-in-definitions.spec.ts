import { describe, expect, it } from 'vitest';
import { BUILT_INS } from './built-in-definitions';

describe('built-in skills', () => {
	it('ships at least one built-in skill', () => {
		expect(BUILT_INS.length).toBeGreaterThan(0);
	});
});
