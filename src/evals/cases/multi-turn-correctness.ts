import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { disambiguationWorkspace } from '../fixtures/workspaces/disambiguation';
import { findCall } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Multi-turn correctness cases.
 *
 * These test the most natural user flow: read a note, then edit it. The agent
 * must edit the same noteId it read on a later turn (via edit_note or
 * save_note), even when context shifts between turns.
 *
 * Each case runs multiple sequential turns using `conversationId` continuity.
 */
export const multiTurnCorrectnessCases: readonly EvalCase[] = [
	{
		id: 'multi-turn-read-then-write',
		name: 'reads a note then edits it on the next turn',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.toolDiscovery, ARCHETYPES.multiStep],
		input: {
			prompt: 'Add "hello world from agent" to the end of it'
		},
		expected: { toolUsed: 'save_note', targetProject: 'Backend' },
		metadata: {
			layer: 'agent',
			note: 'Turn 1 reads Backend API documentation. Turn 2 must save_note on the same noteId.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const projectId = workspace.projectIds.get('Backend')!;
			const expectedNoteId = workspace.noteIds.get('API documentation|Backend')!;

			// Turn 1: read the note
			const turn1 = await runCase(lab, workspace.actor, {
				prompt: 'What does this note say?',
				mode: 'auto_accept',
				projectId,
				noteId: expectedNoteId
			});
			expect(turn1.status).toBe('completed');

			// Turn 2: edit it — must target the right noteId via edit_note or save_note
			const turn2 = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				noteId: expectedNoteId,
				conversationId: turn1.conversationId
			});

			const call = findCall(turn2, 'edit_note') ?? findCall(turn2, 'save_note');
			const targetedId =
				(call?.arguments as Record<string, unknown>)?.noteId ??
				((call?.arguments as Record<string, unknown>)?.note as Record<string, unknown>)?.id;
			const gotCorrect = targetedId === expectedNoteId;

			px.logOutput({
				model: turn2.model,
				turn1Tools: turn1.calledToolNames,
				turn2Tools: turn2.calledToolNames,
				expectedNoteId,
				actualTargetId: targetedId,
				response: turn2.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : 0,
				label: gotCorrect ? 'correct_target' : 'wrong_target',
				explanation: gotCorrect
					? 'edited the same note that was read in turn 1'
					: `targeted ${targetedId} instead of ${expectedNoteId}`
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: call ? 1 : 0,
				label: call ? 'edited' : 'no_edit',
				explanation: call
					? `edited through ${turn2.calledToolNames.filter((name) => name.includes('_note')).join(', ')}`
					: `no note edit tool was called (${turn2.calledToolNames.join(', ') || 'no tools'})`
			});

			expect(turn2.status).toBe('completed');
			expect(
				call,
				'neither edit_note nor save_note was ever called on the write turn'
			).toBeDefined();
			expect(gotCorrect, `agent edited wrong note: ${targetedId}`).toBe(true);
		}
	},
	{
		id: 'multi-turn-switch-then-edit-first',
		name: 'reads note A, switches to B, then correctly edits A when asked',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.contextAwareness, ARCHETYPES.multiStep],
		input: {
			prompt: 'Go back and add a note about caching to the first one'
		},
		expected: { targetNote: 'API documentation|Backend' },
		metadata: {
			layer: 'agent',
			note: 'Turn 1 reads Backend API doc, turn 2 reads Mobile API doc, turn 3 must edit Backend.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const backendProjectId = workspace.projectIds.get('Backend')!;
			const mobileProjectId = workspace.projectIds.get('Mobile')!;
			const backendNoteId = workspace.noteIds.get('API documentation|Backend')!;
			const mobileNoteId = workspace.noteIds.get('API documentation|Mobile')!;

			// Turn 1: read Backend API documentation
			const turn1 = await runCase(lab, workspace.actor, {
				prompt: 'What does this note say?',
				mode: 'auto_accept',
				projectId: backendProjectId,
				noteId: backendNoteId
			});
			expect(turn1.status).toBe('completed');

			// Turn 2: switch to Mobile API documentation
			const turn2 = await runCase(lab, workspace.actor, {
				prompt: 'Now show me this other note',
				mode: 'auto_accept',
				projectId: mobileProjectId,
				noteId: mobileNoteId,
				conversationId: turn1.conversationId
			});
			expect(turn2.status).toBe('completed');

			// Turn 3: "edit the first one" — must target Backend noteId
			const turn3 = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: mobileProjectId,
				noteId: mobileNoteId,
				conversationId: turn2.conversationId
			});

			const call = findCall(turn3, 'edit_note') ?? findCall(turn3, 'save_note');
			const targetedId =
				(call?.arguments as Record<string, unknown>)?.noteId ??
				((call?.arguments as Record<string, unknown>)?.note as Record<string, unknown>)?.id;
			const gotCorrect = targetedId === backendNoteId;
			const gotWrong = targetedId === mobileNoteId;

			px.logOutput({
				model: turn3.model,
				turn1Tools: turn1.calledToolNames,
				turn2Tools: turn2.calledToolNames,
				turn3Tools: turn3.calledToolNames,
				expectedNoteId: backendNoteId,
				actualTargetId: targetedId,
				response: turn3.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.targetCorrectness,
				score: gotCorrect ? 1 : gotWrong ? 0 : 0.5,
				label: gotCorrect ? 'correct_target' : gotWrong ? 'edited_current' : 'unknown',
				explanation: gotCorrect
					? 'correctly edited "the first one" (Backend note from turn 1)'
					: gotWrong
						? 'edited the currently-visible Mobile note instead of the first one'
						: `targeted ${targetedId}`
			});

			expect(turn3.status).toBe('completed');
			expect(call, 'neither edit_note nor save_note was ever called').toBeDefined();
			expect(gotCorrect, 'agent edited the wrong note').toBe(true);
		}
	},
	{
		id: 'multi-turn-memory-capture',
		name: 'proposes a memory change when user reveals a durable personal fact',
		splits: [ARCHETYPES.targetCorrectness, ARCHETYPES.memoryCapture],
		input: {
			prompt: 'By the way, my new employee ID is E-4821. Remember that.'
		},
		expected: { toolUsed: 'propose_memory_change' },
		metadata: {
			layer: 'agent',
			note: 'After reading a note, user reveals a fact. Agent must call propose_memory_change.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, disambiguationWorkspace);
			const projectId = workspace.projectIds.get('Backend')!;
			const noteId = workspace.noteIds.get('API documentation|Backend')!;

			// Turn 1: read a note (establishes conversational context)
			const turn1 = await runCase(lab, workspace.actor, {
				prompt: 'Summarize this note for me',
				mode: 'auto_accept',
				projectId,
				noteId
			});
			expect(turn1.status).toBe('completed');

			// Turn 2: user reveals a durable fact
			const turn2 = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				conversationId: turn1.conversationId
			});

			const call = findCall(turn2, 'propose_memory_change');
			const hasMemoryCall = call !== undefined;
			const contentMentionsId =
				hasMemoryCall && JSON.stringify(call.arguments).toLowerCase().includes('e-4821');

			px.logOutput({
				model: turn2.model,
				turn2Tools: turn2.calledToolNames,
				memoryCallArgs: call?.arguments,
				response: turn2.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryCapture,
				score: hasMemoryCall && contentMentionsId ? 1 : hasMemoryCall ? 0.5 : 0,
				label:
					hasMemoryCall && contentMentionsId ? 'captured' : hasMemoryCall ? 'partial' : 'missed',
				explanation:
					hasMemoryCall && contentMentionsId
						? 'proposed memory change containing employee ID E-4821'
						: hasMemoryCall
							? 'called propose_memory_change but content missing the ID'
							: 'never called propose_memory_change'
			});

			expect(turn2.status).toBe('completed');
			expect(call, 'propose_memory_change was never called').toBeDefined();
			expect(contentMentionsId, 'memory proposal does not contain E-4821').toBe(true);
		}
	}
];
