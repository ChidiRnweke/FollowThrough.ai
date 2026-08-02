import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

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
			const applied = view.note.plainText.includes('leads platform engineering');
			noteEffect(view.note.plainText, 'leads platform engineering');

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(applied, 'note body must contain the replacement text').toBe(true);
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
			const changed = view.note.plainText.includes('K8s');
			const preserved = view.note.plainText.includes('Utrecht');
			noteEffect(view.note.plainText, 'K8s');
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: preserved ? 1 : 0,
				label: preserved ? 'preserved' : 'dropped_content',
				explanation: preserved
					? 'untargeted lines survived the surgical edit'
					: 'the edit dropped untargeted content'
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(changed, 'note body must contain K8s after the edit').toBe(true);
			expect(preserved, 'untargeted note content must survive a surgical edit').toBe(true);
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
			const preserved = view.note.plainText.includes('Utrecht');
			noteEffect(view.note.plainText, 'Utrecht');
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: changed ? 1 : 0,
				label: changed ? 'changed' : 'unchanged',
				explanation: changed ? 'note body changed' : 'note body is unchanged after the request'
			});

			expect(result.status).toBe('completed');
			expect(usedEditTool, 'must edit the note through an edit tool').toBe(true);
			expect(changed, 'the tidy-up must actually change the note').toBe(true);
			expect(preserved, 'a tidy-up must not drop untargeted facts').toBe(true);
		}
	}
];
