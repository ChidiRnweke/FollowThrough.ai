import { describe, expect, it } from 'vitest';
import { AgentEvents } from './events';

describe('AgentEvents', () => {
	it('is available as a domain service', () => {
		expect(AgentEvents).toBeTypeOf('function');
	});
});
