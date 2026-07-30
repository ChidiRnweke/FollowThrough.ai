import { describe, expect, it } from 'vitest';
import { AgentRunLedger } from './ledger';

describe('AgentRunLedger', () => {
	it('is available as a domain service', () => {
		expect(AgentRunLedger).toBeTypeOf('function');
	});
});
