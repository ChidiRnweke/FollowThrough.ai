import { describe, expect, it } from 'vitest';
import { BUILT_INS } from './built-in-definitions';

describe('built-in skills', () => {
	it('forbids HTML labels and gives the escaped-newline alternative', () => {
		const diagramming = BUILT_INS.find((definition) => definition.key === 'diagramming');
		expect({
			forbidsHtml: /HTML labels/i.test(diagramming?.instructions ?? ''),
			showsAlternative: /escaped \\n/i.test(diagramming?.instructions ?? '')
		}).toEqual({ forbidsHtml: true, showsAlternative: true });
	});
});
