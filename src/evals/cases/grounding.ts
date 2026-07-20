import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { groundingWorkspace, GROUNDING_HASH, MEMORY_HASH } from '../fixtures/workspaces/grounding';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { scoreToolCalling } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Grounding cases prove the agent actually reads seeded content and relays it,
 * rather than hallucinating. Each case embeds a distinctive hash in the fixture
 * that must appear verbatim in the response. The assertion is deterministic:
 * no judge, no content quality check — just `response.includes(hash)`.
 */
export const groundingCases: readonly EvalCase[] = [
	{
		id: 'grounding-search-reproduces-hash',
		name: 'searches notes and reproduces the embedded verification code',
		splits: [ARCHETYPES.toolCalling],
		input: { prompt: 'What is the deployment verification code from my runbook?' },
		expected: { requiredTools: ['search'], hash: GROUNDING_HASH },
		metadata: { layer: 'agent', trick: 'hidden hash in note body' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, groundingWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const tools = scoreToolCalling(result, { required: ['search'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const grounded = result.finalResponse.includes(GROUNDING_HASH);
			px.logAnnotation({
				name: 'grounding',
				score: grounded ? 1 : 0,
				label: grounded ? 'grounded' : 'hallucinated',
				explanation: grounded
					? `response contains ${GROUNDING_HASH}`
					: `response does not contain the seeded hash ${GROUNDING_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(grounded, `response must contain ${GROUNDING_HASH}`).toBe(true);
		}
	},
	{
		id: 'grounding-memory-reproduces-hash',
		name: 'reads memory and reproduces the embedded employee ID',
		splits: [ARCHETYPES.toolCalling],
		input: { prompt: 'What is my employee ID? Check your memory.' },
		expected: { requiredTools: ['list_user_memory'], hash: MEMORY_HASH },
		metadata: { layer: 'agent', trick: 'hidden hash in user memory' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, groundingWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const tools = scoreToolCalling(result, { required: ['list_user_memory'] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: tools.passed ? 1 : 0,
				label: tools.passed ? 'pass' : 'fail',
				explanation: tools.explanation
			});

			const grounded = result.finalResponse.includes(MEMORY_HASH);
			px.logAnnotation({
				name: 'grounding',
				score: grounded ? 1 : 0,
				label: grounded ? 'grounded' : 'hallucinated',
				explanation: grounded
					? `response contains ${MEMORY_HASH}`
					: `response does not contain the seeded hash ${MEMORY_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(tools.passed, tools.explanation).toBe(true);
			expect(grounded, `response must contain ${MEMORY_HASH}`).toBe(true);
		}
	},
	{
		id: 'grounding-note-read-reproduces-hash',
		name: 'reads a specific note and reproduces the embedded hash',
		splits: [ARCHETYPES.toolCalling],
		input: {
			prompt: 'Read my "Deployment runbook" note and tell me the verification code it contains.'
		},
		expected: { requiredTools: ['get_note'], hash: GROUNDING_HASH },
		metadata: { layer: 'agent', trick: 'hidden hash, asks to read by title' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, groundingWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			// Agent may use search or get_note or both — we require at least one
			// read path was taken, and the hash was returned.
			const usedSearch = result.calledToolNames.includes('search');
			const usedGetNote = result.calledToolNames.includes('get_note');
			const readContent = usedSearch || usedGetNote;

			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: readContent ? 1 : 0,
				label: readContent ? 'pass' : 'fail',
				explanation: readContent
					? `used ${result.calledToolNames.filter((n) => n === 'search' || n === 'get_note').join(', ')}`
					: `did not call search or get_note; called ${result.calledToolNames.join(', ') || 'nothing'}`
			});

			const grounded = result.finalResponse.includes(GROUNDING_HASH);
			px.logAnnotation({
				name: 'grounding',
				score: grounded ? 1 : 0,
				label: grounded ? 'grounded' : 'hallucinated',
				explanation: grounded
					? `response contains ${GROUNDING_HASH}`
					: `response does not contain the seeded hash ${GROUNDING_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(readContent, 'must call search or get_note to find the hash').toBe(true);
			expect(grounded, `response must contain ${GROUNDING_HASH}`).toBe(true);
		}
	},
	{
		id: 'grounding-negative-no-hallucinated-hash',
		name: 'does not invent a code when the requested info does not exist',
		splits: [ARCHETYPES.toolCalling, 'negative'],
		input: { prompt: 'What is my security clearance code?' },
		expected: { noFabricatedHash: true },
		metadata: { layer: 'agent', note: 'No clearance code exists in seeded data.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			// The agent should not fabricate strings that look like our hash format.
			const fabricated = /[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z]+/.test(result.finalResponse);
			px.logAnnotation({
				name: 'grounding',
				score: fabricated ? 0 : 1,
				label: fabricated ? 'hallucinated_code' : 'honest',
				explanation: fabricated
					? 'response contains a fabricated hash-like code'
					: 'response does not fabricate a code'
			});

			expect(result.status).toBe('completed');
			expect(fabricated, 'must not fabricate a hash-format code').toBe(false);
		}
	}
];
