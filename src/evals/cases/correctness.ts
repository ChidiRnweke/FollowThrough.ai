import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { disambiguationWorkspace } from '../fixtures/workspaces/disambiguation';
import { findCall } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Target correctness: does the agent pass the RIGHT object ID to tools?
 *
 * This is the most dangerous failure mode — calling the correct tool with the
 * WRONG ID silently mutates or reads the wrong object. No error is thrown; the
 * system happily overwrites note A when the user meant note B.
 *
 * All cases use the disambiguation workspace which has identically-named notes
 * and todos across two projects (Backend, Mobile). Assertions check the actual
 * argument values, not just tool presence.
 */
export const correctnessCases: readonly EvalCase[] = [
	{
		id: 'correct-note-read-scoped',
		name: 'reads the right note when two projects have the same note title',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.contextAwareness],
		input: { prompt: 'What does the API documentation say?' },
		expected: { targetProject: 'Backend' },
		metadata: {
			layer: 'agent',
			note: 'Both projects have "API documentation". With Backend projectId, must read Backend\'s.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const projectId = workspace.projectIds.get('Backend')!;
			const expectedNoteId = workspace.noteIds.get('API documentation|Backend')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});

			const call = findCall(result, 'get_note');
			const gotCorrectNote = call?.arguments.noteId === expectedNoteId;
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedNoteId,
				actualNoteId: call?.arguments.noteId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrectNote ? 1 : 0,
				label: gotCorrectNote ? 'correct_target' : 'wrong_target',
				explanation: gotCorrectNote
					? 'read the Backend API documentation note'
					: `read ${call?.arguments.noteId ?? 'nothing'} instead of ${expectedNoteId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'get_note was never called').toBeDefined();
			expect(gotCorrectNote, 'agent read the wrong note').toBe(true);
		}
	},
	{
		id: 'correct-note-edit-scoped',
		name: 'edits the right note when names collide across projects',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolDiscovery],
		input: { prompt: 'Add a section about rate limiting to the API documentation' },
		expected: { targetProject: 'Backend' },
		metadata: {
			layer: 'agent',
			note: 'Must save_note on Backend "API documentation", not Mobile\'s.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const projectId = workspace.projectIds.get('Backend')!;
			const expectedNoteId = workspace.noteIds.get('API documentation|Backend')!;
			const wrongNoteId = workspace.noteIds.get('API documentation|Mobile')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});

			const call = findCall(result, 'save_note');
			const targetedId =
				(call?.arguments as Record<string, unknown>)?.noteId ??
				((call?.arguments as Record<string, unknown>)?.note as Record<string, unknown>)?.id;
			const gotCorrect = targetedId === expectedNoteId;
			const gotWrong = targetedId === wrongNoteId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedNoteId,
				actualTargetId: targetedId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'correct_target' : gotWrong ? 'wrong_target' : 'unknown_target',
				explanation: gotCorrect
					? 'edited Backend API documentation'
					: gotWrong
						? 'edited Mobile API documentation instead!'
						: `targeted ${targetedId} — neither expected ID`
			});

			expect(result.status).toBe('completed');
			expect(call, 'save_note was never called').toBeDefined();
			expect(gotCorrect, `agent edited wrong note: ${targetedId}`).toBe(true);
		}
	},
	{
		id: 'correct-todo-complete-scoped',
		name: 'completes the right todo when both projects have same-named todos',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.multiStep],
		input: { prompt: 'The API docs update is done, cross it off' },
		expected: { targetProject: 'Mobile' },
		metadata: {
			layer: 'agent',
			note: 'Both projects have "Update API documentation" todo. Scoped to Mobile.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const projectId = workspace.projectIds.get('Mobile')!;
			const expectedTodoId = workspace.todoIds.get('Update API documentation|Mobile')!;
			const wrongTodoId = workspace.todoIds.get('Update API documentation|Backend')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});

			const call = findCall(result, 'update_todo');
			const targetedId = (call?.arguments as Record<string, unknown>)?.todoId;
			const gotCorrect = targetedId === expectedTodoId;
			const gotWrong = targetedId === wrongTodoId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedTodoId,
				actualTodoId: targetedId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'correct_target' : gotWrong ? 'wrong_target' : 'no_mutation',
				explanation: gotCorrect
					? 'completed Mobile "Update API documentation" todo'
					: gotWrong
						? 'completed Backend todo instead!'
						: `targeted ${targetedId ?? 'nothing'}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'update_todo was never called').toBeDefined();
			expect(gotCorrect, 'agent marked the wrong todo done').toBe(true);
		}
	},
	{
		id: 'correct-todo-create-scoped',
		name: 'creates a todo in the contextual project, not the other one',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolDiscovery],
		input: { prompt: 'Remind me to write integration tests for the GraphQL layer' },
		expected: { targetProject: 'Mobile' },
		metadata: {
			layer: 'agent',
			note: 'With Mobile projectId, new todo must land in Mobile, not Backend.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const expectedProjectId = workspace.projectIds.get('Mobile')!;
			const wrongProjectId = workspace.projectIds.get('Backend')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: expectedProjectId
			});

			const call = findCall(result, 'create_todo');
			const targetedProjectId = (call?.arguments as Record<string, unknown>)?.projectId;
			const gotCorrect = targetedProjectId === expectedProjectId;
			const gotWrong = targetedProjectId === wrongProjectId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedProjectId,
				actualProjectId: targetedProjectId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'correct_project' : gotWrong ? 'wrong_project' : 'missing',
				explanation: gotCorrect
					? 'created todo in Mobile project'
					: gotWrong
						? 'created todo in Backend project instead!'
						: `projectId was ${targetedProjectId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'create_todo was never called').toBeDefined();
			expect(gotCorrect, 'agent created todo in wrong project').toBe(true);
		}
	},
	{
		id: 'correct-note-create-in-project',
		name: 'creates a new note in the contextual project',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolDiscovery],
		input: { prompt: 'Start a new note about offline sync strategy' },
		expected: { targetProject: 'Mobile' },
		metadata: {
			layer: 'agent',
			note: 'Note creation must scope to Mobile (the active project).'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const expectedProjectId = workspace.projectIds.get('Mobile')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: expectedProjectId
			});

			const call = findCall(result, 'create_note');
			const targetedProjectId = (call?.arguments as Record<string, unknown>)?.projectId;
			const gotCorrect = targetedProjectId === expectedProjectId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedProjectId,
				actualProjectId: targetedProjectId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : 0,
				label: gotCorrect ? 'correct_project' : 'wrong_project',
				explanation: gotCorrect
					? 'created note in Mobile project'
					: `created note in ${targetedProjectId} instead of Mobile`
			});

			expect(result.status).toBe('completed');
			expect(call, 'create_note was never called').toBeDefined();
			expect(gotCorrect, 'agent created note in wrong project').toBe(true);
		}
	},
	{
		id: 'correct-rename-right-project',
		name: 'renames the scoped project, not the other one',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolDiscovery],
		input: { prompt: 'Rename this project to "Backend Services"' },
		expected: { targetProject: 'Backend' },
		metadata: {
			layer: 'agent',
			note: '"this project" with Backend projectId → must rename Backend, not Mobile.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const expectedProjectId = workspace.projectIds.get('Backend')!;
			const wrongProjectId = workspace.projectIds.get('Mobile')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: expectedProjectId
			});

			const call = findCall(result, 'rename_project');
			const targetedProjectId = (call?.arguments as Record<string, unknown>)?.projectId;
			const gotCorrect = targetedProjectId === expectedProjectId;
			const gotWrong = targetedProjectId === wrongProjectId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedProjectId,
				actualProjectId: targetedProjectId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'correct_target' : gotWrong ? 'wrong_target' : 'missing',
				explanation: gotCorrect
					? 'renamed Backend project'
					: gotWrong
						? 'renamed Mobile project instead!'
						: `targeted ${targetedProjectId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'rename_project was never called').toBeDefined();
			expect(gotCorrect, 'agent renamed the wrong project').toBe(true);
		}
	},
	{
		id: 'correct-unique-todo-by-content',
		name: 'picks the right todo from unique content when name is ambiguous',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.multiStep],
		input: { prompt: 'I fixed the push notifications, mark that done' },
		expected: { targetTodo: 'Fix push notification delivery|Mobile' },
		metadata: {
			layer: 'agent',
			note: 'User references "push notifications" — maps uniquely to Mobile project todo.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const expectedTodoId = workspace.todoIds.get('Fix push notification delivery|Mobile')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});

			const call = findCall(result, 'update_todo');
			const targetedId = (call?.arguments as Record<string, unknown>)?.todoId;
			const gotCorrect = targetedId === expectedTodoId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedTodoId,
				actualTodoId: targetedId,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : 0,
				label: gotCorrect ? 'correct_target' : 'wrong_target',
				explanation: gotCorrect
					? 'completed "Fix push notification delivery" todo'
					: `targeted ${targetedId} instead of ${expectedTodoId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'update_todo was never called').toBeDefined();
			expect(gotCorrect, 'agent updated the wrong todo').toBe(true);
		}
	},
	{
		id: 'correct-note-read-by-content-cue',
		name: 'finds the right note from a content cue without projectId',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolCalling],
		input: { prompt: 'Show me the note about event sourcing' },
		expected: { targetNote: 'Architecture decisions|Backend' },
		metadata: {
			layer: 'agent',
			note: '"event sourcing" uniquely identifies Backend Architecture decisions. No projectId given.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const expectedNoteId = workspace.noteIds.get('Architecture decisions|Backend')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});

			// Agent should search, find the Backend note, then read it
			const call = findCall(result, 'get_note');
			const targetedId = (call?.arguments as Record<string, unknown>)?.noteId;
			const gotCorrect = targetedId === expectedNoteId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedNoteId,
				actualNoteId: targetedId,
				response: result.finalResponse.slice(0, 400)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : 0,
				label: gotCorrect ? 'correct_target' : 'wrong_target',
				explanation: gotCorrect
					? 'read Backend Architecture decisions (contains event sourcing)'
					: `read ${targetedId} — expected ${expectedNoteId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'get_note was never called').toBeDefined();
			expect(gotCorrect, 'agent read the wrong note').toBe(true);
		}
	},
	{
		id: 'correct-cross-project-explicit-name',
		name: 'targets a note in another project when user explicitly names it',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.contextAwareness],
		input: { prompt: "What does the Mobile project's API documentation say?" },
		expected: { targetNote: 'API documentation|Mobile' },
		metadata: {
			layer: 'agent',
			note: 'Scoped to Backend but user says "Mobile project". Agent must cross project boundaries.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const backendProjectId = workspace.projectIds.get('Backend')!;
			const expectedNoteId = workspace.noteIds.get('API documentation|Mobile')!;
			const wrongNoteId = workspace.noteIds.get('API documentation|Backend')!;

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: backendProjectId // intentionally scoped to Backend
			});

			const call = findCall(result, 'get_note');
			const targetedId = (call?.arguments as Record<string, unknown>)?.noteId;
			const gotCorrect = targetedId === expectedNoteId;
			const gotWrong = targetedId === wrongNoteId;

			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				expectedNoteId,
				actualNoteId: targetedId,
				response: result.finalResponse.slice(0, 400)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'cross_project_correct' : gotWrong ? 'stayed_in_scope' : 'other',
				explanation: gotCorrect
					? 'correctly read Mobile API documentation despite Backend scope'
					: gotWrong
						? 'read Backend API documentation — ignored user saying "Mobile"'
						: `read ${targetedId}`
			});

			expect(result.status).toBe('completed');
			expect(call, 'get_note was never called').toBeDefined();
			expect(gotCorrect, 'agent read the wrong project note').toBe(true);
		}
	}
];
