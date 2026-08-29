import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { PERSONA_NAME, personaWorkspace } from '../fixtures/workspaces/profile';
import { conflictingScopeWorkspace } from '../fixtures/workspaces/engineering';
import { findCall, scoreToolCalling } from '../assertions/tool-calls';
import { judgeAdherenceConsensus } from '../judges/consensus';
import { expectSuggestionPending } from '../assertions/effects';
import { ARCHETYPES, type EvalCase } from './types';

const ENGLISH_ONLY = 'Always answer in English.';

/**
 * Memory behaviour is not "always obey memory". The agent's instructions rank
 * the sources: an explicit request beats durable memory, and project memory
 * beats general user memory inside a relevant project. Adherence, precedence
 * and capture are scored separately because an agent can be perfect at one and
 * broken at the others, and a single memory score would hide that.
 */
export const memoryCases: readonly EvalCase[] = [
	{
		id: 'memory-adherence-dutch-prompt',
		name: 'honours an English-only memory when asked in Dutch',
		splits: [ARCHETYPES.memoryAdherence, 'regression'],
		input: {
			prompt: `Wat kan je mij vertellen over ${PERSONA_NAME}?`,
			instruction: ENGLISH_ONLY
		},
		expected: { requiredTools: [] },
		metadata: {
			observedAt: '2026-07-19',
			note: 'Production regression: memory was retrieved but not followed.'
		},
		async run(lab) {
			// Seeded per run so repetitions cannot inherit memory the agent
			// proposed during an earlier one.
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames,
				durationMs: result.durationMs
			});

			const tools = scoreToolCalling(result, {
				required: this.expected.requiredTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const adherence = await judgeAdherenceConsensus({
				instruction: this.input.instruction as string,
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryAdherence,
				annotatorKind: 'LLM',
				score: adherence.followed ? 1 : 0,
				label: adherence.verdict,
				explanation: `${adherence.agreement} agreement across ${adherence.judges} judges (${adherence.votes.join(', ')}): ${adherence.reasoning}`
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'precedence-explicit-request-wins',
		name: 'lets an explicit request override a standing memory',
		splits: [ARCHETYPES.memoryPrecedence],
		input: {
			prompt: `Antwoord alsjeblieft in het Nederlands: wat weet je over ${PERSONA_NAME}?`,
			instruction:
				'The response must be written in Dutch, because the user explicitly asked for Dutch in this message, which overrides any standing preference for English.'
		},
		expected: { precedence: 'explicit_request_over_memory' },
		metadata: { note: 'Stored memory says English; this message explicitly asks for Dutch.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const adherence = await judgeAdherenceConsensus({
				instruction: this.input.instruction as string,
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryPrecedence,
				annotatorKind: 'LLM',
				score: adherence.followed ? 1 : 0,
				label: adherence.verdict,
				explanation: `${adherence.agreement} agreement across ${adherence.judges} judges (${adherence.votes.join(', ')}): ${adherence.reasoning}`
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'precedence-project-over-user',
		name: 'prefers project memory over user memory inside that project',
		splits: [ARCHETYPES.memoryPrecedence],
		input: {
			prompt:
				'I am working in the Ledger Service project. Show me a small code snippet that validates a posting balances to zero.',
			instruction:
				'The code snippet must be written in TypeScript, not Python, because project memory for Ledger Service overrides the general user preference for Python.'
		},
		expected: { precedence: 'project_memory_over_user_memory' },
		metadata: { note: 'User memory says Python; Ledger Service project memory says TypeScript.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, conflictingScopeWorkspace);
			const projectId = workspace.projectIds.get('Ledger Service');
			if (!projectId) throw new Error('The Ledger Service project was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const adherence = await judgeAdherenceConsensus({
				instruction: this.input.instruction as string,
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryPrecedence,
				annotatorKind: 'LLM',
				score: adherence.followed ? 1 : 0,
				label: adherence.verdict,
				explanation: `${adherence.agreement} agreement across ${adherence.judges} judges (${adherence.votes.join(', ')}): ${adherence.reasoning}`
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'memory-capture-durable-fact',
		name: 'proposes a memory when the user reveals something durable',
		splits: [ARCHETYPES.memoryCapture],
		input: {
			prompt:
				'For future reference: I have moved to Ghent, and I now lead the platform team rather than the data team.'
		},
		expected: { requiredTools: ['propose_memory_change'] },
		metadata: { note: 'A durable change of location and role.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames,
				proposal: findCall(result, 'propose_memory_change')?.arguments
			});

			const verdict = scoreToolCalling(result, {
				required: this.expected.requiredTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryCapture,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'captured' : 'missed',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'memory-capture-negative-transient',
		name: 'does not propose a memory for a transient remark',
		splits: [ARCHETYPES.memoryCapture, 'negative'],
		input: { prompt: 'I am a bit tired today, so keep it brief please.' },
		expected: { forbiddenTools: ['propose_memory_change'] },
		metadata: { note: 'Transient state, not a durable fact worth remembering.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const verdict = scoreToolCalling(result, {
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryCapture,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'correctly_skipped' : 'over_captured',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'memory-capture-negative-bounded-preference',
		name: 'does not remember a preference explicitly bounded to one incident',
		splits: [ARCHETYPES.memoryCapture, 'negative', 'ambiguity'],
		input: {
			prompt:
				'For this incident review only, use terse bullets. What does my Background note say about my role?'
		},
		expected: { forbiddenTools: ['propose_memory_change'] },
		metadata: {
			note: 'The wording resembles a preference, but "this incident review only" makes it transient.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			const verdict = scoreToolCalling(result, {
				forbidden: this.expected.forbiddenTools as string[]
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryCapture,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'correctly_bounded' : 'over_captured',
				explanation: verdict.explanation
			});
			expect(
				{ status: result.status, skippedCapture: verdict.passed },
				verdict.explanation
			).toEqual({ status: 'completed', skippedCapture: true });
		}
	},
	{
		id: 'memory-proactive-embedded-fact',
		name: 'proposes a memory when a durable fact arrives embedded in a task',
		splits: [ARCHETYPES.memoryProactiveProposal],
		input: {
			prompt:
				'For me, the knowledge layer is the gold standard for depth and breadth — I always want that standard applied to my reference docs. Update sections 2 through 13 of the reference architecture note to match.'
		},
		expected: { requiredTools: ['propose_memory_change'] },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: 51/51 sessions never called propose_memory_change even though users repeatedly stated durable work preferences mid-task ("the knowledge layer is the gold standard"). The existing capture case uses the explicit "For future reference:" cue; this variant hides the fact as the stated reason for a bulk task, which is how it actually arrived.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Knowledge Platform',
						notes: [
							{
								title: 'Reference Architecture',
								body: Array.from(
									{ length: 13 },
									(_, index) => `## Section ${index + 1}\n\nDraft architecture guidance.`
								).join('\n\n')
							}
						]
					}
				]
			});
			const projectId = workspace.projectIds.get('Knowledge Platform');
			const noteId = workspace.noteIds.get('Reference Architecture');
			if (!projectId || !noteId)
				throw new Error('Proactive-memory fixture is missing its reference architecture note.');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				noteId
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames,
				calls: result.toolCalls.map((call) => ({
					name: call.name,
					arguments: call.arguments,
					failure: call.failure
				})),
				proposal: findCall(result, 'propose_memory_change')?.arguments
			});

			const verdict = scoreToolCalling(result, {
				required: this.expected.requiredTools as string[]
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryProactiveProposal,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'proposed' : 'missed',
				explanation: verdict.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'memory-task-read-before-dependent-work',
		name: 'applies an injected profile preference without rereading it',
		splits: [ARCHETYPES.memoryTaskRead],
		input: {
			prompt:
				'Rewrite the first paragraph of my Background note using my preferred spelling conventions.'
		},
		expected: { spelling: 'british' },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Reframed from a tool-call gate. Profile memory is injected into every system prompt by AgentRunContext, so requiring list_user_memory asserted a redundant read the context builder deliberately makes unnecessary — and the old version also required list_project_memory while seeding no project memory and passing no projectId, which made it unpassable. The note now seeds American spellings so only the stored preference can produce the British rewrite.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				memories: [
					'Spelling preference: always use British English (organisation, behaviour, colour).'
				],
				projects: [
					{
						name: 'Profile',
						notes: [
							{
								title: 'Background',
								body: 'This organization specializes in behavior-driven platform engineering and color-coded dashboards.'
							}
						]
					}
				]
			});
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId: workspace.projectIds.get('Profile')
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const noteId = workspace.noteIds.get('Background')!;
			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const body = view.note.plainText.toLowerCase();
			const british = ['organisation', 'behaviour', 'colour'].filter((word) => body.includes(word));
			const american = ['organization', 'behavior', 'color'].filter((word) => body.includes(word));
			const applied = british.length === 3 && american.length === 0;

			px.logAnnotation({
				name: ARCHETYPES.memoryTaskRead,
				score: applied ? 1 : 0,
				label: applied ? 'applied_memory' : 'ignored_memory',
				explanation: `British forms present: ${british.join(', ') || 'none'}; American forms remaining: ${american.join(', ') || 'none'}`
			});
			// Diagnostic only: the preference is already in the system prompt, so a
			// list call is neither required nor forbidden — it is simply redundant.
			px.logAnnotation({
				name: 'redundant_memory_read',
				score: result.calledToolNames.includes('list_user_memory') ? 0 : 1,
				label: result.calledToolNames.includes('list_user_memory') ? 'reread' : 'used_injected',
				explanation: `tools: ${result.calledToolNames.join(', ') || 'none'}`
			});

			expect(
				{
					status: result.status,
					applied,
					detail: `British: ${british.join(', ') || 'none'} / American left: ${american.join(', ') || 'none'}`
				},
				result.failure ?? 'the rewrite must apply the injected British-English preference'
			).toEqual({
				status: 'completed',
				applied: true,
				detail: 'British: organisation, behaviour, colour / American left: none'
			});
		}
	},
	{
		id: 'memory-project-scoped-fetch',
		name: 'fetches project memory when a project convention governs the output',
		splits: [ARCHETYPES.memoryTaskRead],
		input: {
			prompt:
				'Draft the acceptance criteria section for the Ledger Service release note, following our project conventions.'
		},
		expected: { convention: 'gherkin' },
		metadata: {
			observedAt: '2026-08-10',
			note: 'Project memory is deliberately NOT injected into the system prompt (see AgentRunContext) — the agent must call list_project_memory when a project convention could govern the result. The convention is hidden: it exists only in project-scoped memory, so an agent that never fetches it cannot produce Gherkin.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Ledger Service',
						memories: [
							'Convention: every acceptance criterion is written in Gherkin, using Given/When/Then lines.'
						],
						notes: [
							{
								title: 'Release Note',
								body: 'Ledger Service 2.4 introduces double-entry posting validation.'
							}
						]
					}
				]
			});
			const projectId = workspace.projectIds.get('Ledger Service');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			px.logOutput({
				model: result.model,
				response: result.finalResponse,
				toolCalls: result.calledToolNames
			});

			const noteId = workspace.noteIds.get('Release Note')!;
			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const haystack = `${result.finalResponse}\n${view.note.plainText}`.toLowerCase();
			const keywords = ['given', 'when', 'then'].filter((word) => haystack.includes(word));
			const followed = keywords.length === 3;

			px.logAnnotation({
				name: ARCHETYPES.memoryTaskRead,
				score: followed ? 1 : 0,
				label: followed ? 'fetched_and_applied' : 'missed_convention',
				explanation: `Gherkin keywords present: ${keywords.join(', ') || 'none'}; tools: ${result.calledToolNames.join(', ') || 'none'}`
			});

			expect(
				{ status: result.status, followed },
				result.failure ??
					`the hidden project convention requires Given/When/Then; found ${keywords.join(', ') || 'none'} (tools: ${result.calledToolNames.join(', ') || 'none'})`
			).toEqual({ status: 'completed', followed: true });
		}
	},
	{
		id: 'memory-implied-preference-inside-note-task',
		name: 'captures an implied durable preference while completing the useful task',
		splits: [ARCHETYPES.memoryProactiveProposal, ARCHETYPES.multiStep, 'ambiguity'],
		input: {
			prompt:
				'Weekly updates are only useful to me when they close with an owner and the date we will check again. Put a short Launch update in a new note: rollout is green, Maya owns it, next check is 28 August.'
		},
		expected: { suggestionKind: 'memory', noteContains: ['maya', '28 august'] },
		metadata: {
			note: 'The durable preference is stated as task rationale, with no remember/future-reference cue.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, { projects: [{ name: 'Launch' }] });
			const projectId = workspace.projectIds.get('Launch');
			if (!projectId) throw new Error('Launch project was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			const shell = await lab.controllers.workspace().getShellContext(workspace.actor);
			const created = shell.noteTree.find(
				(note) => note.projectId === projectId && note.kind === 'note'
			);
			const body = created
				? (
						await lab.controllers.notes().get(workspace.actor, { noteId: created.id })
					).note.plainText.toLowerCase()
				: '';
			const queued = await expectSuggestionPending(lab, workspace.actor, 'memory');
			const noteComplete = (this.expected.noteContains as string[]).every((part) =>
				body.includes(part)
			);
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				createdNote: created?.title,
				memoryEffect: queued.explanation
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryProactiveProposal,
				score: queued.passed ? 1 : 0,
				label: queued.passed ? 'captured' : 'missed',
				explanation: queued.explanation
			});
			expect(
				{
					status: result.status,
					usefulTaskLanded: noteComplete,
					memoryIsReviewable: queued.passed
				},
				`${queued.explanation}; note=${created?.title ?? 'missing'}`
			).toEqual({ status: 'completed', usefulTaskLanded: true, memoryIsReviewable: true });
		}
	},
	{
		id: 'memory-indirect-project-convention-edit',
		name: 'infers that an indirect local-standard request requires project memory',
		splits: [ARCHETYPES.memoryTaskRead, ARCHETYPES.multiStep, 'ambiguity'],
		input: { prompt: 'Tidy this decision note so it matches how we do architecture here.' },
		expected: { markers: ['Owner:', 'Revisit when:'] },
		metadata: {
			note: 'Only project memory explains what "how we do architecture here" means.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Architecture',
						memories: [
							'Architecture convention: every decision summary ends with an "Owner:" line and a "Revisit when:" line.'
						],
						notes: [
							{
								title: 'Queue decision',
								body: '# Queue decision\n\nWe chose NATS for low-latency fan-out.\n'
							}
						]
					}
				]
			});
			const projectId = workspace.projectIds.get('Architecture');
			const noteId = workspace.noteIds.get('Queue decision');
			if (!projectId || !noteId) throw new Error('Architecture decision fixture was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId,
				noteId
			});
			const view = await lab.controllers.notes().get(workspace.actor, { noteId });
			const applied = (this.expected.markers as string[]).every((marker) =>
				view.note.plainText.includes(marker)
			);
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				appliedMarkers: applied
			});
			px.logAnnotation({
				name: ARCHETYPES.memoryTaskRead,
				score: applied ? 1 : 0,
				label: applied ? 'applied_project_convention' : 'missed_project_convention',
				explanation: `tools: ${result.calledToolNames.join(', ') || 'none'}`
			});
			expect(
				{ status: result.status, applied },
				result.failure ?? 'project-memory convention must land in the persisted note'
			).toEqual({ status: 'completed', applied: true });
		}
	}
];
