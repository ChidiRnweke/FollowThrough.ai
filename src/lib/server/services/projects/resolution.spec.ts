import { describe, expect, it } from 'vitest';
import { ensureProjectForActor } from './resolution';

describe('project resolution', () => {
	it('is available as the project resolver', () => {
		expect(ensureProjectForActor).toBeTypeOf('function');
	});
});
