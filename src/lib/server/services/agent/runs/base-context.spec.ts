import { describe, expect, it } from 'vitest';
import { BaseAgentContext } from './base-context';

describe('BaseAgentContext', () => {
	it('is available as a domain service', () => {
		expect(BaseAgentContext).toBeTypeOf('function');
	});
});
