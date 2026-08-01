import { describe, expect, it } from 'vitest';
import {
	assertAgentRunTransition,
	canTransitionAgentRun,
	isTerminalAgentRunStatus,
	type AgentRunStatus
} from '$lib/models/agent';

const allowed: readonly [AgentRunStatus, AgentRunStatus][] = [
	['queued', 'running'],
	['queued', 'cancelled'],
	['running', 'awaiting_approval'],
	['running', 'queued'],
	['running', 'cancelling'],
	['running', 'completed'],
	['running', 'failed'],
	['awaiting_approval', 'queued'],
	['awaiting_approval', 'cancelling'],
	['cancelling', 'cancelled']
];

describe('agent run lifecycle invariants', () => {
	for (const [from, to] of allowed) {
		it(`allows ${from} to transition to ${to}`, () => {
			expect(canTransitionAgentRun(from, to)).toBe(true);
		});
	}

	for (const terminal of ['completed', 'failed', 'cancelled'] as const) {
		it(`${terminal} is terminal`, () => {
			expect(isTerminalAgentRunStatus(terminal)).toBe(true);
		});

		it(`${terminal} cannot transition to queued`, () => {
			expect(() => assertAgentRunTransition(terminal, 'queued')).toThrow();
		});
	}

	it('rejects skipping from queued to completed', () => {
		expect(() => assertAgentRunTransition('queued', 'completed')).toThrow();
	});

	it('rejects cancelling an approval wait without the cancelling state', () => {
		expect(() => assertAgentRunTransition('awaiting_approval', 'cancelled')).toThrow();
	});
});
