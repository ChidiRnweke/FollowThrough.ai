import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { todosWorkspace } from '../fixtures/workspaces/todos';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { findCall, scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Multi-step cases prove the agent chains tools correctly for composite tasks.
 * Assertions are on tool call presence and sequence — not content quality.
 */
export const multiStepCases: readonly EvalCase[] = [
	{
		id: 'multi-step-search-then-read',
		name: 'searches, then reads the found note for a detailed question',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.toolCalling],
		input: {
			prompt: 'What does the Checkout architecture note say about how the Ledger Service is called?'
		},
		expected: { requiredTools: ['search'] },
		metadata: { layer: 'agent', note: 'Needs search to find, then get_note or read detail.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			// Must at least search; may also get_note for full content.
			const tools = scoreToolCalling(result, { required: ['search'] });
			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	},
	{
		id: 'multi-step-list-then-complete',
		name: 'lists todos to find the right one, then marks it done',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'I finished renewing the TLS certificates. Mark that todo as done.'
		},
		expected: { requiredSequence: ['list_todos', 'update_todo'] },
		metadata: { layer: 'agent', note: 'No ID given — must list first to find it.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const names = result.calledToolNames;
			const listIndex = names.indexOf('list_todos');
			const updateIndex = names.indexOf('update_todo');
			const sequenceCorrect = listIndex >= 0 && updateIndex > listIndex;

			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: sequenceCorrect ? 1 : 0,
				label: sequenceCorrect ? 'pass' : 'fail',
				explanation: sequenceCorrect
					? `list_todos at ${listIndex}, update_todo at ${updateIndex}`
					: `list_todos=${listIndex}, update_todo=${updateIndex}; expected list before update`
			});

			expect(result.status).toBe('completed');
			expect(listIndex, 'must call list_todos').toBeGreaterThanOrEqual(0);
			expect(updateIndex, 'must call update_todo').toBeGreaterThan(listIndex);
		}
	},
	{
		id: 'multi-step-create-todo-with-project',
		name: 'creates a todo scoped to a project by resolving the project first',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'Add a todo to my Platform project: deploy v2 to production.'
		},
		expected: { tool: 'create_todo', hasProjectId: true },
		metadata: {
			layer: 'agent',
			note: 'Agent must figure out the projectId before creating the todo.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const call = findCall(result, 'create_todo');
			const hasProject = call && typeof call.arguments.projectId === 'string';

			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: call && hasProject ? 1 : 0,
				label: call && hasProject ? 'pass' : 'fail',
				explanation: hasProject
					? `create_todo called with projectId=${call.arguments.projectId}`
					: call
						? 'create_todo called without projectId'
						: `create_todo never called; called ${result.calledToolNames.join(', ')}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'must call create_todo').toBeTruthy();
			expect(hasProject, 'create_todo must include a projectId').toBe(true);
		}
	},
	{
		id: 'multi-step-read-then-propose',
		name: 'reads a note then proposes action items from it',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'Extract action items from my "Checkout architecture" note.'
		},
		expected: { requiredTools: ['extract_promises'] },
		metadata: { layer: 'agent', note: 'Needs to read note content then call extract_promises.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			// Must discover and call extract_promises.
			const verdict = scoreToolDiscovery(result, 'extract_promises');
			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'multi-step-negative-no-read-before-create',
		name: 'does not waste a search before a simple create',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.stoppingBehavior, 'negative'],
		input: { prompt: 'Create a project called "Migration Tracker".' },
		expected: { forbiddenTools: ['search', 'get_note'] },
		metadata: { layer: 'agent', note: 'Simple creation needs no prior research.' },
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

			const tools = scoreToolCalling(result, {
				forbidden: ['search', 'get_note']
			});
			px.logAnnotation({
				name: ARCHETYPES.stoppingBehavior,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'efficient' : 'over_researched',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	}
];
