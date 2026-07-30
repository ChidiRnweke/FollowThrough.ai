import { describe, expect, it } from 'vitest';
import { unknownUseToolName } from './tool-recovery';

describe('tool recovery', () => {
	it('offers a recovery path for an unknown tool', () => {
		expect(unknownUseToolName('missing', [])).toHaveProperty('recovery');
	});
});
