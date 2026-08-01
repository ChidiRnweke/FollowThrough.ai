import { describe, expect, it } from 'vitest';
import { BUILT_INS } from './built-in-definitions';

describe('built-in skills', () => {
	it('ships at least one built-in skill', () => {
		expect(BUILT_INS.length).toBeGreaterThan(0);
	});

	it('forbids HTML labels in the diagramming skill and names the alternative', () => {
		const diagramming = BUILT_INS.find((definition) => definition.key === 'diagramming');
		expect(diagramming).toBeDefined();
		expect(diagramming?.instructions).toMatch(/HTML labels/i);
		expect(diagramming?.instructions).toMatch(/escaped \\n/i);
	});
});
