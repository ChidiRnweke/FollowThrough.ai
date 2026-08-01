import { describe, expect, it } from 'vitest';
import { BUILT_INS } from './built-in-definitions';

describe('built-in skills', () => {
	it('ships at least one built-in skill', () => {
		expect(BUILT_INS.length).toBeGreaterThan(0);
	});

	it('forbids HTML labels in the diagramming skill and names the alternative (1/3)', () => {
		const diagramming = BUILT_INS.find((definition) => definition.key === 'diagramming');
		expect(diagramming).toBeDefined();
	});

	it('forbids HTML labels in the diagramming skill and names the alternative (2/3)', () => {
		const diagramming = BUILT_INS.find((definition) => definition.key === 'diagramming');
		expect(diagramming?.instructions).toMatch(/HTML labels/i);
	});

	it('forbids HTML labels in the diagramming skill and names the alternative (3/3)', () => {
		const diagramming = BUILT_INS.find((definition) => definition.key === 'diagramming');
		expect(diagramming?.instructions).toMatch(/escaped \\n/i);
	});
});
