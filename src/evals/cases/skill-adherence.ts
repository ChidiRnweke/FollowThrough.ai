import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { skillsWorkspace, SKILL_HASH } from '../fixtures/workspaces/skills';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Skill adherence: the agent must load skill instructions and follow them.
 * Proved by embedding a unique hash in the skill body that must appear in the
 * response when the skill is active. Tool-call assertions confirm `load_skill`
 * was called; the hash confirms the instructions were followed.
 */
export const skillAdherenceCases: readonly EvalCase[] = [
	{
		id: 'skill-loaded-produces-hash',
		name: 'loads a requested skill and follows its instructions',
		splits: [ARCHETYPES.skillAdherence, ARCHETYPES.toolCalling],
		input: {
			prompt: 'Summarize the compliance notes using the Compliance format skill.'
		},
		expected: { requiredTools: ['load_skill'], hash: SKILL_HASH },
		metadata: { layer: 'agent', trick: 'hidden hash in skill body' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, skillsWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				requestedSkillNames: ['Compliance format']
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 500)
			});

			const tools = scoreToolCalling(result, { required: ['load_skill'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const followed = result.finalResponse.includes(SKILL_HASH);
			px.logAnnotation({
				name: ARCHETYPES.skillAdherence,
				score: followed ? 1 : 0,
				label: followed ? 'followed' : 'ignored',
				explanation: followed
					? `response contains skill stamp ${SKILL_HASH}`
					: `response does not contain ${SKILL_HASH} — skill instructions were ignored`
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(followed, `response must contain skill stamp ${SKILL_HASH}`).toBe(true);
		}
	},
	{
		id: 'skill-negative-not-loaded',
		name: 'does not load a skill when none is relevant',
		splits: [ARCHETYPES.skillAdherence, ARCHETYPES.stoppingBehavior, 'negative'],
		input: { prompt: 'What is 2 + 2?' },
		expected: { forbiddenTools: ['load_skill'] },
		metadata: { layer: 'agent', note: 'A trivial question with no skill relevance.' },
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

			const tools = scoreToolCalling(result, { forbidden: ['load_skill'] });
			px.logAnnotation({
				name: ARCHETYPES.skillAdherence,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'correctly_skipped' : 'over_loaded',
				explanation: tools.explanation
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
		}
	},
	{
		id: 'skill-discovered-by-name',
		name: 'discovers and loads a skill when the user mentions it by name',
		splits: [ARCHETYPES.skillAdherence, ARCHETYPES.toolCalling],
		input: {
			prompt: 'Use the Compliance format skill to write up the current status of the audit project.'
		},
		expected: { requiredTools: ['load_skill'], hash: SKILL_HASH },
		metadata: {
			layer: 'agent',
			note: 'No requestedSkillNames hint — agent must discover the skill itself.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, skillsWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
				// Deliberately NOT passing requestedSkillNames — agent must find it.
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 500)
			});

			const tools = scoreToolCalling(result, { required: ['load_skill'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const followed = result.finalResponse.includes(SKILL_HASH);
			px.logAnnotation({
				name: ARCHETYPES.skillAdherence,
				score: followed ? 1 : 0,
				label: followed ? 'followed' : 'ignored',
				explanation: followed
					? `response contains skill stamp ${SKILL_HASH}`
					: `response does not contain ${SKILL_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(followed, `response must contain skill stamp ${SKILL_HASH}`).toBe(true);
		}
	},
	{
		id: 'skill-edited-with-edit-skill',
		name: 'edits a skill body in place with edit_skill',
		splits: [ARCHETYPES.toolCalling, ARCHETYPES.effect, 'skill_editing'],
		input: {
			prompt:
				'Use the edit_skill tool on the Compliance format skill to replace the text "Do not include disclaimers or hedging language." with "Do not include disclaimers or hedging language, and always end with EDIT-OK."'
		},
		expected: { requiredTools: ['edit_skill'], effect: 'EDIT-OK landed in the skill body' },
		metadata: { layer: 'agent', trick: 'mutation must land in the committed skill note' },
		async run(lab) {
			const { actor, skillIds } = await seedWorkspace(lab, skillsWorkspace);
			const skillNoteId = skillIds.get('Compliance format');
			if (!skillNoteId) throw new Error('Compliance format skill was not seeded');
			const result = await runCase(lab, actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 500)
			});

			const tools = scoreToolCalling(result, { required: ['edit_skill'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const view = await lab.controllers.notes().get(actor, { noteId: skillNoteId });
			const applied = view.note.plainText.includes('EDIT-OK');
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: applied ? 1 : 0,
				label: applied ? 'landed' : 'missing',
				explanation: applied
					? 'skill body now carries EDIT-OK'
					: 'skill body unchanged — the edit did not land'
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(applied, 'skill body must contain EDIT-OK after the edit').toBe(true);
		}
	},
	{
		id: 'skill-rewritten-with-save-skill',
		name: 'rewrites a whole skill body with save_skill',
		splits: [ARCHETYPES.toolCalling, ARCHETYPES.effect, 'skill_editing'],
		input: {
			prompt:
				'Use the save_skill tool to replace the Compliance format skill body with exactly: "Findings are reported as a numbered list ending with the token SAVE-OK."'
		},
		expected: { requiredTools: ['save_skill'], effect: 'SAVE-OK landed in the skill body' },
		metadata: { layer: 'agent', trick: 'whole-body replace must commit' },
		async run(lab) {
			const { actor, skillIds } = await seedWorkspace(lab, skillsWorkspace);
			const skillNoteId = skillIds.get('Compliance format');
			if (!skillNoteId) throw new Error('Compliance format skill was not seeded');
			const result = await runCase(lab, actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 500)
			});

			const tools = scoreToolCalling(result, { required: ['save_skill'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const view = await lab.controllers.notes().get(actor, { noteId: skillNoteId });
			const applied = view.note.plainText.includes('SAVE-OK');
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: applied ? 1 : 0,
				label: applied ? 'landed' : 'missing',
				explanation: applied
					? 'skill body now carries SAVE-OK'
					: 'skill body unchanged — the rewrite did not land'
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(applied, 'skill body must contain SAVE-OK after the rewrite').toBe(true);
		}
	}
];
