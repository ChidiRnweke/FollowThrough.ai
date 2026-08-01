import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { PERSONA_NAME, personaWorkspace } from '../fixtures/workspaces/profile';
import { conflictingScopeWorkspace } from '../fixtures/workspaces/engineering';
import { findCall, scoreToolCalling } from '../assertions/tool-calls';
import { judgeAdherenceConsensus } from '../judges/consensus';
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
	}
];
