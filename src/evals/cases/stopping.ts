import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { retrievalCorpusWorkspace } from '../fixtures/workspaces/engineering';
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
	},
	{
		id: 'stopping-no-search-repeat',
		name: 'does not call search more than once for a simple question',
		splits: [ARCHETYPES.stoppingBehavior],
		input: { prompt: 'How do I handle a Postgres failover?' },
		expected: { maxSearchCalls: 1 },
		metadata: { layer: 'agent', note: 'One search should suffice; repeating is wasted work.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const searchCount = result.calledToolNames.filter((n) => n === 'search').length;
			const passed = searchCount <= 1;
			px.logAnnotation({
				name: ARCHETYPES.stoppingBehavior,
				score: passed ? 1 : 0,
				label: passed ? 'efficient' : 'repeated_search',
				explanation: `search called ${searchCount} time(s)`
			});

			expect(result.status).toBe('completed');
			expect(searchCount, `search called ${searchCount} times, expected ≤1`).toBeLessThanOrEqual(1);
		}
	},
	{
		id: 'stopping-mutation-within-budget',
		name: 'completes a create operation within a reasonable tool budget',
		splits: [ARCHETYPES.stoppingBehavior],
		input: { prompt: 'Create a project called "Analytics Dashboard".' },
		expected: { maxCalls: 6 },
		metadata: {
			layer: 'agent',
			note: 'search_tools + create_project + maybe a read or two. 6 is generous.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				callCount: result.toolCalls.length,
				response: result.finalResponse.slice(0, 200)
			});

			const verdict = scoreStoppingBehavior(result, { maxCalls: 6 });
			px.logAnnotation({
				name: ARCHETYPES.stoppingBehavior,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'within_budget' : 'over_budget',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	}
];
