import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { conflictingScopeWorkspace } from '../fixtures/workspaces/engineering';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { findCall, scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Context awareness: the agent must use scoped context (projectId, noteId,
 * contextNoteIds) to select the right tools and pass correct arguments. All
 * assertions are on tool calls and their arguments — no content judgement.
 */
export const contextAwarenessCases: readonly EvalCase[] = [
	{
		id: 'context-project-scoped-memory',
		name: 'reads project memory when given a projectId',
		splits: [ARCHETYPES.contextAwareness, ARCHETYPES.toolCalling],
		input: { prompt: 'What conventions does this project follow? Check the project memory.' },
		expected: { requiredTools: ['list_project_memory'] },
		metadata: { layer: 'agent', note: 'projectId is passed; agent should use it.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, conflictingScopeWorkspace);
			const projectId = workspace.projectIds.get('Ledger Service');
			if (!projectId) throw new Error('Ledger Service project was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const tools = scoreToolCalling(result, { required: ['list_project_memory'] });
			px.logAnnotation({
				name: ARCHETYPES.contextAwareness,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	},
	{
		id: 'context-note-scoped-read',
		name: 'reads the current note when given a noteId and asked about "this note"',
		splits: [ARCHETYPES.contextAwareness, ARCHETYPES.toolCalling],
		input: { prompt: 'Summarize this note for me.' },
		expected: { requiredTools: ['get_note'] },
		metadata: { layer: 'agent', note: 'noteId is passed; agent should read it directly.' },
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

			const tools = scoreToolCalling(result, { required: ['get_note'] });
			const call = findCall(result, 'get_note');
			const usedCorrectId = call?.arguments?.noteId === noteId;

			px.logAnnotation({
				name: ARCHETYPES.contextAwareness,
				score: tools.passed && usedCorrectId ? 1 : 0,
				label: tools.passed && usedCorrectId ? 'pass' : 'fail',
				explanation: usedCorrectId
					? `get_note called with correct noteId`
					: `get_note called with ${JSON.stringify(call?.arguments?.noteId)}, expected ${noteId}`
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(usedCorrectId, 'get_note must use the provided noteId').toBe(true);
		}
	},
	{
		id: 'context-note-ids-reads-all',
		name: 'answers from all attached context notes',
		splits: [ARCHETYPES.contextAwareness, ARCHETYPES.multiStep],
		input: { prompt: 'What do these notes have in common? Compare them.' },
		expected: { mentionsBothNotes: true },
		metadata: {
			layer: 'agent',
			note: 'Two contextNoteIds provided; both ride inside the user message, so the answer must draw on each without any tool call.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, conflictingScopeWorkspace);
			const noteId1 = workspace.noteIds.get('Ledger Service overview');
			const noteId2 = workspace.noteIds.get('Ingestion pipeline');
			if (!noteId1 || !noteId2) throw new Error('Expected notes were not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				contextNoteIds: [noteId1, noteId2]
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const response = result.finalResponse.toLowerCase();
			const mentionsFirst = response.includes('ledger');
			const mentionsSecond = ['ingestion', 'dagster', 'iceberg'].some((k) =>
				response.includes(k)
			);
			const passed = mentionsFirst && mentionsSecond;
			px.logAnnotation({
				name: ARCHETYPES.contextAwareness,
				score: passed ? 1 : 0,
				label: passed ? 'pass' : 'fail',
				explanation: `response draws on Ledger note: ${mentionsFirst}, on Ingestion note: ${mentionsSecond}`
			});

			expect(result.status).toBe('completed');
			expect(
				passed,
				'response should draw on both attached notes (Ledger Service overview and Ingestion pipeline)'
			).toBe(true);
		}
	},
	{
		id: 'context-no-project-uses-search',
		name: 'uses broad search when no project context is given',
		splits: [ARCHETYPES.contextAwareness, 'negative'],
		input: { prompt: 'Find anything in my notes about deployment procedures.' },
		expected: { requiredTools: ['search'], forbiddenTools: ['list_project_memory'] },
		metadata: { layer: 'agent', note: 'No projectId → should use search, not project memory.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames
			});

			const tools = scoreToolCalling(result, {
				required: ['search'],
				forbidden: ['list_project_memory']
			});
			px.logAnnotation({
				name: ARCHETYPES.contextAwareness,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	}
];
