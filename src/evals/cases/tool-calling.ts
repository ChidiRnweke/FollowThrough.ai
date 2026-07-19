import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { findCall, scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Tool behaviour is the part of the agent judgeable without opinion: the event
 * log states exactly which capability ran, with what payload, and whether it
 * failed. Every assertion here is deterministic — no judge involved.
 */
export const toolCallingCases: readonly EvalCase[] = [
	{
		id: 'tool-calling-grounded-recall',
		name: 'reads memory rather than guessing when asked what it knows',
		splits: [ARCHETYPES.toolCalling],
		input: { prompt: 'What do you already know about me? Use what you have stored.' },
		expected: { requiredTools: ['list_user_memory'] },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const verdict = scoreToolCalling(result, {
				required: this.expected.requiredTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'tool-calling-negative-no-retrieval',
		name: 'answers a conversational aside without reaching for tools',
		splits: [ARCHETYPES.toolCalling, 'negative'],
		input: { prompt: 'Thanks, that is all I needed for now.' },
		expected: { forbiddenTools: ['search', 'list_user_memory', 'get_workspace_context'] },
		metadata: { note: 'Negative case: the capability must not fire when it is not warranted.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const verdict = scoreToolCalling(result, {
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'tool-discovery-create-todo',
		name: 'discovers todo creation through the tool catalog',
		splits: [ARCHETYPES.toolDiscovery],
		input: {
			prompt:
				'Add a todo to my Profile project: "Draft the Q3 architecture review" due next Friday.'
		},
		expected: { targetTool: 'create_todo' },
		metadata: { note: 'create_todo is not first-class, so reaching it requires search_tools.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			const target = this.expected.targetTool as string;
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames,
				createdTodo: findCall(result, target)?.arguments
			});

			const verdict = scoreToolDiscovery(result, target);
			px.logAnnotation({
				name: ARCHETYPES.toolDiscovery,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	}
];
