import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace, selectionFromSeededNote } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { expectSuggestionPending } from '../assertions/effects';
import { ARCHETYPES, type EvalCase } from './types';

const implicitCommitments =
	"Maya thinks the retry notes are nearly there. I can take the runbook cleanup, and she said she'd wire the alert before Friday; the rest can wait.";

const implicitCommitmentWorkspace = {
	projects: [
		{
			name: 'Checkout',
			notes: [{ title: 'Incident follow-up', body: implicitCommitments }]
		}
	]
};

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
			prompt: 'Pull out what we owe from this.',
			selectionText: implicitCommitments
		},
		expected: { tool: 'extract_promises' },
		metadata: {
			layer: 'agent',
			note: 'Commitments use indirect conversational language; a todo proposal must persist.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, implicitCommitmentWorkspace);
			const noteId = workspace.noteIds.get('Incident follow-up');
			if (!noteId) throw new Error('Incident follow-up note was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: await selectionFromSeededNote(
					lab,
					workspace,
					noteId,
					this.input.selectionText as string
				)
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolDiscovery(result, 'extract_promises');
			const queued = await expectSuggestionPending(lab, workspace.actor, 'todo');
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect({
				status: result.status,
				discovered: verdict.passed,
				persisted: queued.passed
			}).toEqual({
				status: 'completed',
				discovered: true,
				persisted: true
			});
		}
	},
	{
		id: 'selection-triggers-find-references',
		name: 'calls find_references when asked to find related notes for a selection',
		splits: [ARCHETYPES.selectionHandling, ARCHETYPES.toolDiscovery],
		input: {
			prompt: 'Can we substantiate what this passage says?',
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
				selection: await selectionFromSeededNote(
					lab,
					workspace,
					noteId,
					this.input.selectionText as string
				)
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolDiscovery(result, 'find_references');
			const queued = await expectSuggestionPending(lab, workspace.actor, 'reference');
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});

			expect({
				status: result.status,
				discovered: verdict.passed,
				persisted: queued.passed
			}).toEqual({
				status: 'completed',
				discovered: true,
				persisted: true
			});
		}
	},
	{
		id: 'selection-ambiguous-related-notes',
		name: 'proposes related notes when the user asks what else speaks to a passage',
		splits: [ARCHETYPES.selectionHandling, ARCHETYPES.toolDiscovery, 'ambiguity'],
		input: {
			prompt: 'What else in my notes speaks to this?',
			selectionText:
				'The Checkout API calls the Payment Gateway to authorise the card, and waits for the authorisation result.'
		},
		expected: { tool: 'relate_selection', suggestionKind: 'backlink' },
		metadata: {
			layer: 'agent',
			note: '"What else" means workspace-note relationships, not external evidence.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: await selectionFromSeededNote(
					lab,
					workspace,
					noteId,
					this.input.selectionText as string
				)
			});
			const verdict = scoreToolDiscovery(result, 'relate_selection');
			const queued = await expectSuggestionPending(lab, workspace.actor, 'backlink');
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed && queued.passed ? 1 : 0,
				label: verdict.passed && queued.passed ? 'pass' : 'fail',
				explanation: `${verdict.explanation}; ${queued.explanation}`
			});
			expect({
				status: result.status,
				discovered: verdict.passed,
				persisted: queued.passed
			}).toEqual({
				status: 'completed',
				discovered: true,
				persisted: true
			});
		}
	},
	{
		id: 'selection-negative-descriptive-passage',
		name: 'does not invent commitments from a merely descriptive selection',
		splits: [ARCHETYPES.selectionHandling, 'negative', 'ambiguity'],
		input: {
			prompt: 'Anything here that I need to do?',
			selectionText:
				'The Checkout API calls the Payment Gateway to authorise the card, and waits for the authorisation result.'
		},
		expected: { forbiddenTools: ['extract_promises'] },
		metadata: {
			layer: 'agent',
			note: 'Negative twin: architecture behavior is not a human commitment.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			if (!noteId) throw new Error('Checkout architecture note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: await selectionFromSeededNote(
					lab,
					workspace,
					noteId,
					this.input.selectionText as string
				)
			});
			const verdict = scoreToolCalling(result, {
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.selectionHandling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'no_false_commitment' : 'false_commitment',
				explanation: verdict.explanation
			});
			expect({ status: result.status, avoidedFalseProposal: verdict.passed }).toEqual({
				status: 'completed',
				avoidedFalseProposal: true
			});
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

			expect({ status: result.status, tools: tools.passed }).toEqual({
				status: 'completed',
				tools: true
			});
		}
	}
];
