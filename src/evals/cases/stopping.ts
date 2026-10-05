import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { scoreStoppingBehavior } from '../assertions/stopping';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Stopping behaviour: does the agent terminate without looping or over-calling?
 * Assertions are on tool call counts and repetition — not content.
 */
export const stoppingCases: readonly EvalCase[] = [
	{
		id: 'stopping-no-tools-for-chitchat',
		name: 'completes a trivial message with zero tool calls',
		splits: [ARCHETYPES.stoppingBehavior],
		input: { prompt: 'Thanks, that covers everything I needed!' },
		expected: { maxCalls: 0 },
		metadata: { layer: 'agent', note: 'A polite closing needs no tools at all.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 200)
			});

			const verdict = scoreStoppingBehavior(result, { maxCalls: 0 });
			px.logAnnotation({
				name: ARCHETYPES.stoppingBehavior,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'minimal' : 'over_called',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	}
];
