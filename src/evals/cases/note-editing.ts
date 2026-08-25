import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';
import { noteMarkdownFromContent } from '$lib/server/services/notes/markdown';

/**
 * Note-tool choice: edit_note and save_note are deliberately different
 * operations, and the agent must reach for the right one. The two lead cases
 * are mutually exclusive — a wholesale replacement must be save_note with
 * edit_note forbidden, and a surgical change must be edit_note with save_note
 * forbidden. The ambiguous case proves a vague request still lands a change
 * without destroying untargeted content.
 */

const noteEffect = (plainText: string, expected: string) =>
	px.logAnnotation({
		name: ARCHETYPES.effect,
		score: plainText.includes(expected) ? 1 : 0,
		label: plainText.includes(expected) ? 'applied' : 'not_applied',
		explanation: plainText.includes(expected)
			? `note body contains "${expected}"`
			: `note body does not contain "${expected}"`
	});

export const noteEditingCases: readonly EvalCase[] = [
	{
		id: 'note-rewrite-requires-save-note',
		name: 'rewrites a whole note only with save_note',
		splits: [ARCHETYPES.toolCalling, ARCHETYPES.effect],
		input: {
			prompt:
				'Discard the entire content of my Background note and replace it with exactly: "Robin leads platform engineering at Northwind Analytics."'
		},
		expected: {
			requiredTools: ['save_note'],
			forbiddenTools: ['edit_note'],
			effect: 'rewritten body'
		},
		metadata: {
			layer: 'agent',
			note: 'A wholesale replacement must use save_note; edit_note cannot express discarding the whole body.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const noteId = workspace.noteIds.get('Background');
			if (!noteId) throw new Error('Background note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const tools = scoreToolCalling(result, {
				required: ['save_note'],
				forbidden: ['edit_note']
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'save_note' : 'wrong_tool',
				explanation: tools.explanation
			});

			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const markdown = noteMarkdownFromContent(view.note.document).trim();
			const applied = markdown === 'Robin leads platform engineering at Northwind Analytics.';
			noteEffect(view.note.plainText, 'leads platform engineering');

			expect(
				{ status: result.status, tools: tools.passed, exactReplacement: applied },
				tools.explanation
			).toEqual({ status: 'completed', tools: true, exactReplacement: true });
		}
	},
	{
		id: 'note-surgical-edit-requires-edit-note',
		name: 'makes a surgical edit only with edit_note',
		splits: [ARCHETYPES.toolCalling, ARCHETYPES.effect],
		input: {
			prompt: 'In my Background note, change "Kubernetes" to "K8s". Change nothing else.'
		},
		expected: {
			requiredTools: ['edit_note'],
			forbiddenTools: ['save_note'],
			effect: 'surgical change'
		},
		metadata: {
			layer: 'agent',
			note: 'A single anchored replacement must use edit_note; save_note would discard the rest of the note.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const noteId = workspace.noteIds.get('Background');
			if (!noteId) throw new Error('Background note was not seeded');
			const before = await lab.controllers.notes().get(workspace.actor, { noteId });
			const expectedMarkdown = noteMarkdownFromContent(before.note.document).replace(
				'Kubernetes',
				'K8s'
			);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const tools = scoreToolCalling(result, {
				required: ['edit_note'],
				forbidden: ['save_note']
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'edit_note' : 'wrong_tool',
				explanation: tools.explanation
			});

			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const actualMarkdown = noteMarkdownFromContent(view.note.document);
			const changed = actualMarkdown.includes('K8s');
			const preserved = actualMarkdown === expectedMarkdown;
			noteEffect(view.note.plainText, 'K8s');
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: preserved ? 1 : 0,
				label: preserved ? 'preserved' : 'dropped_content',
				explanation: preserved
					? 'untargeted lines survived the surgical edit'
					: 'the edit dropped untargeted content'
			});

			expect({ status: result.status, tools: tools.passed, changed, preserved }).toEqual({
				status: 'completed',
				tools: true,
				changed: true,
				preserved: true
			});
		}
	},
	{
		id: 'note-edit-ambiguous-scope',
		name: 'handles an ambiguous tidy-up request without destroying content',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.effect],
		input: { prompt: 'Tidy up my Background note, it could do with a refresh.' },
		expected: { effect: 'edited, untargeted content preserved' },
		metadata: {
			layer: 'agent',
			note: 'A vague edit request must still land a change and not wipe untargeted facts.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const noteId = workspace.noteIds.get('Background');
			if (!noteId) throw new Error('Background note was not seeded');
			const seeded = await lab.controllers.notes().get(workspace.actor, { noteId });
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const called = result.calledToolNames;
			const usedEditTool = ['edit_note', 'save_note'].some((name) => called.includes(name));
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: usedEditTool ? 1 : 0,
				label: usedEditTool ? 'edited' : 'no_edit',
				explanation: usedEditTool
					? `edited through ${called.filter((name) => name.includes('_note')).join(', ')}`
					: `no edit tool was used (${called.join(', ') || 'no tools'})`
			});

			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const changed = view.note.plainText !== seeded.note.plainText;
			const facts = [
				'Robin Aldridge',
				'eight years',
				'Terraform',
				'public-sector research funding',
				'nine product teams'
			];
			const missingFacts = facts.filter((fact) => !view.note.plainText.includes(fact));
			const preserved = missingFacts.length === 0;
			noteEffect(view.note.plainText, 'Utrecht');
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: changed ? 1 : 0,
				label: changed ? 'changed' : 'unchanged',
				explanation: changed ? 'note body changed' : 'note body is unchanged after the request'
			});

			expect(
				{ status: result.status, usedEditTool, changed, preserved },
				missingFacts.length ? `dropped seeded facts: ${missingFacts.join(', ')}` : undefined
			).toEqual({ status: 'completed', usedEditTool: true, changed: true, preserved: true });
		}
	},
	{
		id: 'note-surgical-edit-long-note',
		name: 'makes a surgical edit on a long note without clobbering unrelated sections',
		splits: [ARCHETYPES.toolCalling, ARCHETYPES.effect],
		input: {
			prompt:
				'In my Long note, change the phrase "legacy scheduler" to "event-driven scheduler". Change nothing else.'
		},
		expected: {
			requiredTools: ['edit_note'],
			forbiddenTools: ['save_note'],
			effect: 'final markdown equals the original with exactly one phrase replaced'
		},
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: the agent used whole-document save_note for single localized changes (one run saved before even reading the note). On a long multi-section note a save_note rewrite silently drops untargeted sections. The gate is exact final-text equality rather than "called edit_note", because the tool a run picks is not the harm — losing an unrelated byte is. Tool names stay as diagnostic annotations.'
		},
		async run(lab) {
			const originalBody = [
				'# Scheduler design',
				'The platform runs a legacy scheduler that wakes every five minutes.',
				'# Cost governance',
				'Every cluster carries a monthly cost ceiling of 4000 credits.',
				'# Untouchable section',
				'The answer to everything remains 42 and this line must survive any edit.'
			].join('\n\n');
			const expectedBody = originalBody.replace('legacy scheduler', 'event-driven scheduler');
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Infra',
						notes: [{ title: 'Long note', body: originalBody }]
					}
				]
			});
			const noteId = workspace.noteIds.get('Long note');
			if (!noteId) throw new Error('Long note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			// Diagnostic only. Reaching the right final text through save_note is not a
			// failure; reaching the wrong text through edit_note is.
			const tools = scoreToolCalling(result, {
				required: this.expected.requiredTools as string[],
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'edit_note' : 'wrong_tool',
				explanation: tools.explanation
			});

			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const actualBody = noteMarkdownFromContent(view.note.document).trim();
			const exact = actualBody === expectedBody.trim();
			noteEffect(view.note.plainText, 'event-driven scheduler');
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: exact ? 1 : 0,
				label: exact ? 'surgical' : 'clobbered',
				explanation: exact
					? 'final markdown is the original with exactly one phrase replaced'
					: `final markdown diverged from the expected single replacement:\n--- expected ---\n${expectedBody.trim()}\n--- actual ---\n${actualBody}`
			});

			expect(
				{ status: result.status, body: actualBody },
				'a localized edit must leave every unrelated byte untouched'
			).toEqual({ status: 'completed', body: expectedBody.trim() });
		}
	}
];
