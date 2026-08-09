import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { findCall, scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Completion regressions found in production (past 7 days, 51 agent sessions):
 *
 * - `task_completion`: several turns read 11–13 notes and then ended in
 *   narration ("Let me first…") with zero mutation, burning 170k+ tokens.
 * - `context_continuity`: a terse "continue" restarted the reads from scratch
 *   (10+ fresh searches, ~1.2M input tokens) instead of resuming the in-flight
 *   task.
 * - `rework_avoidance`: identical prompts auto-re-executed and duplicated side
 *   effects (the same "create todos" run fired twice, creating duplicates).
 *
 * All fixtures are synthetic; nothing from real production content is used.
 */
export const completionRegressionCases: readonly EvalCase[] = [
	{
		id: 'task-completion-lands-effect',
		name: 'lands a multi-note edit instead of ending in narration',
		splits: [ARCHETYPES.taskCompletion],
		input: {
			prompt:
				'Add an "Outcome" section to the end of each of my six backlog notes (Backlog 1 through Backlog 6) summarising what was delivered, and keep the existing intro line in each note.'
		},
		expected: { mutation: ['edit_note', 'save_note'], sections: 6 },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: reads-all-then-narrates turns with 11–13 reads and zero writes, each burning 170k+ tokens, on a bulk multi-document request.'
		},
		async run(lab) {
			const notes = Array.from({ length: 6 }, (_, index) => ({
				title: `Backlog ${index + 1}`,
				body: `Intro line for backlog ${index + 1}: the migration milestone and its acceptance criteria live here.`
			}));
			const workspace = await seedWorkspace(lab, {
				projects: [{ name: 'Launch', notes }]
			});
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: workspace.projectIds.get('Launch')
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const mutated = result.calledToolNames.some((name) =>
				(this.expected.mutation as string[]).includes(name)
			);
			px.logAnnotation({
				name: ARCHETYPES.taskCompletion,
				score: mutated ? 1 : 0,
				label: mutated ? 'mutated' : 'narration_only',
				explanation: mutated
					? `mutated through ${result.calledToolNames.filter((name) =>
							(this.expected.mutation as string[]).includes(name)
						).join(', ')}`
					: `no mutation tool called (${result.calledToolNames.join(', ') || 'no tools'})`
			});

			let landed = 0;
			for (let index = 1; index <= 6; index += 1) {
				const noteId = workspace.noteIds.get(`Backlog ${index}`);
				if (!noteId) continue;
				const view = await lab.controllers.notes().get(workspace.actor, { noteId });
				if (view.note.plainText.toLowerCase().includes('outcome')) landed += 1;
			}
			px.logAnnotation({
				name: ARCHETYPES.effect,
				score: landed === 6 ? 1 : 0,
				label: landed === 6 ? 'all_sections' : `partial_${landed}`,
				explanation: `${landed}/6 notes carry an Outcome section`
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(mutated, 'the run must perform a mutation, not end in narration').toBe(true);
			expect(landed, `expected an Outcome section in all 6 notes, landed in ${landed}`).toBe(6);
		}
	},
	{
		id: 'continuation-resumes-not-restarts',
		name: 'continues from context instead of re-reading the note it already holds',
		splits: [ARCHETYPES.contextContinuity],
		input: { firstTurn: 'Read the note "Launch Plan" and name its top action item.', secondTurn: 'continue' },
		expected: { forbiddenTools: ['get_note', 'search'] },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: a bare "continue" re-ran 10+ fresh searches (~1.2M input tokens) instead of resuming the task already in context.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Launch',
						notes: [
							{
								title: 'Launch Plan',
								body: 'Top action item: finalise the pricing tier. Secondary: schedule the demo.'
							}
						]
					}
				]
			});
			const projectId = workspace.projectIds.get('Launch');

			const turn1 = await runCase(lab, workspace.actor, {
				prompt: this.input.firstTurn as string,
				mode: 'auto_accept',
				projectId
			});
			expect(turn1.status).toBe('completed');
			expect(
				turn1.calledToolNames.includes('get_note'),
				'turn 1 must have read the note so the continuation has context'
			).toBe(true);

			const turn2 = await runCase(lab, workspace.actor, {
				prompt: this.input.secondTurn as string,
				mode: 'auto_accept',
				projectId,
				conversationId: turn1.conversationId
			});
			px.logOutput({
				model: turn2.model,
				turn1Tools: turn1.calledToolNames,
				turn2Tools: turn2.calledToolNames,
				response: turn2.finalResponse.slice(0, 400)
			});

			const verdict = scoreToolCalling(turn2, {
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.contextContinuity,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'resumed' : 'restarted',
				explanation: verdict.explanation
			});

			expect(turn2.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'rework-avoidance-duplicate-write',
		name: 'does not duplicate todos when the identical request re-runs',
		splits: [ARCHETYPES.reworkAvoidance],
		input: {
			prompt: 'Add the todos "Write Q3 report" and "Book release review" to the Launch project.'
		},
		expected: { todoCount: 2 },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: the identical create-todos request auto-executed twice, creating duplicate todos; the retry storm around one prompt spanned 2–7 runs.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, { projects: [{ name: 'Launch' }] });
			const projectId = workspace.projectIds.get('Launch')!;

			const turn1 = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			expect(turn1.status).toBe('completed');

			const turn2 = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				conversationId: turn1.conversationId
			});
			px.logOutput({
				model: turn2.model,
				turn1Tools: turn1.calledToolNames,
				turn2Tools: turn2.calledToolNames,
				createdTurn1: findCall(turn1, 'create_todo')?.arguments ?? findCall(turn1, 'create_todos')?.arguments,
				createdTurn2: findCall(turn2, 'create_todo')?.arguments ?? findCall(turn2, 'create_todos')?.arguments
			});

			const after = await lab.controllers.todos().count(workspace.actor, { projectId });
			px.logAnnotation({
				name: ARCHETYPES.reworkAvoidance,
				score: after === 2 ? 1 : 0,
				label: after === 2 ? 'no_duplicates' : `duplicated_${after}`,
				explanation: `project holds ${after} todos after the request ran twice`
			});

			expect(turn2.status).toBe('completed');
			expect(after, `expected 2 todos, found ${after}`).toBe(2);
		}
	}
];
