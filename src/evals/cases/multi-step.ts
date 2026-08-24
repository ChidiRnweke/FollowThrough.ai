import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace, selectionFromSeededNote } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { todosWorkspace } from '../fixtures/workspaces/todos';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { findCall, scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';
import { expectSuggestionPending } from '../assertions/effects';

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
	},
	{
		id: 'multi-step-ambiguous-certificate-follow-up',
		name: 'uses current-note evidence to close the right one of two similar todos',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.effect, 'ambiguity'],
		input: { prompt: 'That certificate follow-up is done now—close the right one.' },
		expected: {
			completed: 'Renew the edge TLS certificate',
			untouched: 'Rotate service certificates'
		},
		metadata: {
			note: 'The prompt omits the todo title; the active incident note disambiguates two plausible tasks.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Platform',
						notes: [
							{
								title: 'Edge certificate incident',
								body: 'The edge TLS certificate renewal succeeded. The follow-up for that incident can now be closed. Service-to-service certificates were not part of this incident.'
							}
						]
					}
				],
				todos: [
					{ title: 'Renew the edge TLS certificate', projectName: 'Platform' },
					{ title: 'Rotate service certificates', projectName: 'Platform' }
				]
			});
			const projectId = workspace.projectIds.get('Platform');
			const noteId = workspace.noteIds.get('Edge certificate incident');
			if (!projectId || !noteId) throw new Error('Certificate ambiguity fixture was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				noteId
			});
			const { todos } = await lab.controllers.todos().list(workspace.actor, { projectId });
			const statuses = Object.fromEntries(todos.map((view) => [view.todo.title, view.todo.status]));
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				statuses
			});
			const resolved =
				statuses['Renew the edge TLS certificate'] === 'done' &&
				statuses['Rotate service certificates'] !== 'done';
			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: resolved ? 1 : 0,
				label: resolved ? 'resolved_correctly' : 'wrong_or_collateral_update',
				explanation: JSON.stringify(statuses)
			});
			expect(
				{ status: result.status, resolvedWithoutCollateralChange: resolved },
				result.failure ?? JSON.stringify(statuses)
			).toEqual({ status: 'completed', resolvedWithoutCollateralChange: true });
		}
	},
	{
		id: 'multi-step-diagram-and-review-reminder',
		name: 'creates a diagram proposal and a dated review todo from one natural request',
		splits: [ARCHETYPES.multiStep, ARCHETYPES.effect, ARCHETYPES.toolDiscovery, 'ambiguity'],
		input: {
			prompt:
				'Turn this into a picture I can review, and leave me a reminder for Friday to check it.'
		},
		expected: { suggestionKind: 'diagram', dueDate: '2026-08-28' },
		metadata: {
			observedAt: '2026-08-24',
			note: 'Compound production-style request: create the visual and persist the follow-up, then stop.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const projectId = workspace.projectIds.get('Checkout');
			const noteId = workspace.noteIds.get('Checkout architecture');
			const sourceText = architectureWorkspace.projects?.[0]?.notes?.[0]?.body;
			if (!projectId || !noteId || !sourceText)
				throw new Error('Checkout architecture fixture was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				noteId,
				selection: await selectionFromSeededNote(lab, workspace, noteId, sourceText)
			});
			const diagram = await expectSuggestionPending(lab, workspace.actor, 'diagram');
			const { todos } = await lab.controllers.todos().list(workspace.actor, { projectId });
			const reminder = todos.find(
				(view) =>
					view.todo.dueDate === this.expected.dueDate &&
					/(diagram|picture|review|architecture)/i.test(view.todo.title)
			);
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				diagram: diagram.explanation,
				reminder: reminder?.todo.title
			});
			const complete = diagram.passed && Boolean(reminder);
			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: complete ? 1 : 0,
				label: complete ? 'both_effects' : 'partial_or_missing',
				explanation: `${diagram.explanation}; reminder=${reminder?.todo.title ?? 'missing'}`
			});
			expect(
				{
					status: result.status,
					diagramPending: diagram.passed,
					reminderPersisted: Boolean(reminder)
				},
				result.failure ?? `${diagram.explanation}; reminder=${reminder?.todo.title ?? 'missing'}`
			).toEqual({ status: 'completed', diagramPending: true, reminderPersisted: true });
		}
	},
	{
		id: 'multi-step-usual-update-with-latent-preference',
		name: 'combines skill, project convention, note creation, and durable preference capture',
		splits: [
			ARCHETYPES.multiStep,
			ARCHETYPES.skillAdherence,
			ARCHETYPES.memoryCapture,
			'ambiguity'
		],
		input: {
			prompt:
				"We're green except checkout latency. Maya owns the follow-up. Friday is the day I always want these updates checked. Do the usual Launch update."
		},
		expected: { stamp: 'LAUNCH-WEEKLY-V2', markers: ['Signal', 'Risk', 'Next'] },
		metadata: {
			note: 'Synthetic version of long production chains that load a skill, read project memory, mutate, and verify.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Launch',
						memories: ['Launch status notes use the headings Signal, Risk, and Next.']
					}
				],
				skills: [
					{
						name: 'Weekly status update',
						description: 'Write the usual weekly project update',
						triggerHints: ['usual update', 'weekly update', 'status'],
						body: 'Create a new project note. Preserve the project headings. End the note with LAUNCH-WEEKLY-V2.',
						projectName: 'Launch'
					}
				]
			});
			const projectId = workspace.projectIds.get('Launch');
			if (!projectId) throw new Error('Launch fixture was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			const shell = await lab.controllers.workspace().getShellContext(workspace.actor);
			const note = shell.noteTree.find(
				(candidate) => candidate.projectId === projectId && candidate.kind === 'note'
			);
			const body = note
				? (await lab.controllers.notes().get(workspace.actor, { noteId: note.id })).note.plainText
				: '';
			const memory = await expectSuggestionPending(lab, workspace.actor, 'memory');
			const followed =
				body.includes(this.expected.stamp as string) &&
				(this.expected.markers as string[]).every((marker) => body.includes(marker));
			const loadedSkill = result.calledToolNames.includes('load_skill');
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				createdNote: note?.title,
				memory: memory.explanation
			});
			px.logAnnotation({
				name: ARCHETYPES.multiStep,
				score: loadedSkill && followed && memory.passed ? 1 : 0,
				label: loadedSkill && followed && memory.passed ? 'all_effects' : 'partial_or_missing',
				explanation: `skill=${loadedSkill}; note=${followed}; ${memory.explanation}`
			});
			expect(
				{ status: result.status, loadedSkill, followed, memoryProposed: memory.passed },
				result.failure ?? `skill=${loadedSkill}; note=${followed}; ${memory.explanation}`
			).toEqual({ status: 'completed', loadedSkill: true, followed: true, memoryProposed: true });
		}
	}
];
