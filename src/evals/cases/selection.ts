import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Selection cases prove the agent dispatches selection-scoped tools when text
 * is highlighted, and falls back to note-level tools when no selection exists.
 * All assertions are on tool calls — not content.
 */
export const selectionCases: readonly EvalCase[] = [
	{
		id: 'selection-triggers-extract-promises',
		name: 'calls extract_promises when a selection with commitments is provided',
		splits: [ARCHETYPES.selectionHandling, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'Extract action items from this selected text.',
			selectionText:
				'I will deploy the new payment gateway by Friday and notify the downstream teams once traffic is migrated.'
		},
		expected: { tool: 'extract_promises' },
		metadata: { layer: 'agent', note: 'Selection present → selection tool preferred.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: {
					noteId,
					revision: 1,
					from: 0,
					to: 130,
					text: this.input.selectionText as string
				}
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolDiscovery(result, 'extract_promises');
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'selection-triggers-find-references',
		name: 'calls find_references when asked to find related notes for a selection',
		splits: [ARCHETYPES.selectionHandling, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'Find notes related to this selected text.',
			selectionText:
				'The Checkout API calls the Payment Gateway to authorise the card, and waits for the authorisation result.'
		},
		expected: { tool: 'find_references' },
		metadata: { layer: 'agent', note: 'Selection + "find related" → find_references.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: {
					noteId,
					revision: 1,
					from: 0,
					to: 110,
					text: this.input.selectionText as string
				}
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolDiscovery(result, 'find_references');
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'selection-negative-no-selection-uses-get-note',
		name: 'uses get_note instead of extract_promises when no selection is present',
		splits: [ARCHETYPES.selectionHandling, 'negative'],
		input: { prompt: 'What are the action items in this note?' },
		expected: { requiredTools: ['get_note'], forbiddenTools: ['extract_promises'] },
		metadata: {
			layer: 'agent',
			note: 'No selection → must read the note, not try to extract from nothing.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
				// No selection provided.
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const tools = scoreToolCalling(result, {
				required: ['get_note'],
				forbidden: ['extract_promises']
			});
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	}
];
