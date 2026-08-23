import { describe, expect, it } from 'vitest';
import { readStoredAgentRunState } from './session-storage';

describe('stored agent run state', () => {
	it('distinguishes missing state', () => {
		expect(readStoredAgentRunState(null)).toEqual({ kind: 'missing' });
	});

	it('returns a validated resume point', () => {
		expect(readStoredAgentRunState('{"cursor":"12","attempt":2}')).toEqual({
			kind: 'valid',
			state: { cursor: '12', attempt: 2 }
		});
	});

	it('reports corrupt state instead of inventing an empty resume point', () => {
		expect(readStoredAgentRunState('{"cursor":')).toMatchObject({ kind: 'corrupt' });
	});
});
