import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { todosWorkspace } from '../fixtures/workspaces/todos';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import {
	conflictingScopeWorkspace,
	retrievalCorpusWorkspace
} from '../fixtures/workspaces/engineering';
import { groundingWorkspace, GROUNDING_HASH, MEMORY_HASH } from '../fixtures/workspaces/grounding';
import { skillsWorkspace, SKILL_HASH } from '../fixtures/workspaces/skills';
import { scoreIntentInterpretation } from '../assertions/intent';
import { scoreStoppingBehavior } from '../assertions/stopping';
import { scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Intent interpretation: the hardest tier. These prompts are deliberately vague,
 * multi-intent, or conversational fragments that require the agent to decompose
 * ambiguous user speech into a reasonable tool plan. Expected pass rate: 60–75%.
 *
 * Assertions use group-based logic: "at least one tool from this set" rather
 * than prescribing exact tool names. This tests INTERPRETATION, not obedience.
 */
export const intentInterpretationCases: readonly EvalCase[] = [
	{
		id: 'intent-prep-for-standup',
		name: 'prepares context for a standup from a casual request',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: { prompt: 'Before standup — what am I working on and is anything overdue?' },
		expected: { required: ['list_todos'], minDistinctTools: 2 },
		metadata: {
			layer: 'agent',
			note: 'Compound request: must read todos AND synthesize broader context.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const projectId = workspace.projectIds.get('Platform');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				...(projectId ? { projectId } : {})
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const verdict = scoreIntentInterpretation(result, {
				required: ['list_todos'],
				minDistinctTools: 2,
				maxCalls: 8
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'interpreted' : 'under_served',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-lost-train-of-thought',
		name: 'responds to a maximally vague request by reading state',
		splits: [ARCHETYPES.intentInterpretation],
		input: { prompt: 'I lost my train of thought, what was I doing?' },
		expected: { atLeastOneOf: [['list_todos', 'get_workspace_context', 'search']] },
		metadata: {
			layer: 'agent',
			note: 'Extremely vague — agent must infer "read my current state" from almost nothing.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const projectId = workspace.projectIds.get('Platform');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				...(projectId ? { projectId } : {})
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const verdict = scoreIntentInterpretation(result, {
				atLeastOneOf: [['list_todos', 'get_workspace_context', 'search']],
				maxCalls: 6
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'interpreted' : 'did_nothing',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-capture-meeting-outcomes',
		name: 'persists something when the user narrates decisions and follow-ups',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: {
			prompt:
				'Just got out of the architecture review — we decided to split the payment service and I need to follow up with Sarah about timelines'
		},
		expected: {
			atLeastOneOf: [['create_note', 'create_todo', 'propose_memory_change']]
		},
		metadata: {
			layer: 'agent',
			note: 'Multi-intent buried in narrative. ANY write is acceptable — create_note, create_todo, or memory.'
		},
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

			const verdict = scoreIntentInterpretation(result, {
				atLeastOneOf: [['create_note', 'create_todo', 'propose_memory_change']],
				maxCalls: 10
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'captured' : 'lost',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-clean-up-plate',
		name: 'reads todos and attempts mutations when asked to clean up',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: {
			prompt:
				"Can you clean up my list? Anything that sounds done should be crossed off, then tell me what's left"
		},
		expected: { required: ['list_todos'], atLeastOneOf: [['update_todo']] },
		metadata: {
			layer: 'agent',
			note: 'Hardest case: read → reason about completion state → mutate → summarize.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const verdict = scoreIntentInterpretation(result, {
				required: ['list_todos'],
				atLeastOneOf: [['update_todo']],
				maxCalls: 12
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'cleaned' : 'incomplete',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-share-with-team',
		name: 'handles two distinct intents in one breath (publish + export)',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: {
			prompt:
				'The checkout architecture thing is ready, make it available for the team and also turn it into something I can attach to the email'
		},
		expected: { minDistinctTools: 2, atLeastOneOf: [['publish_note', 'export_document']] },
		metadata: {
			layer: 'agent',
			note: 'Two separate intents: "available for team" = publish, "attach to email" = export. Both should fire.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				...(noteId ? { noteId } : {})
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			// Ideally BOTH publish and export, but at minimum one of them
			const verdict = scoreIntentInterpretation(result, {
				atLeastOneOf: [['publish_note', 'export_document']],
				minDistinctTools: 2,
				maxCalls: 10
			});

			// Bonus: did it get BOTH?
			const calledSet = new Set(result.calledToolNames);
			const gotBoth = calledSet.has('publish_note') && calledSet.has('export_document');
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: gotBoth ? 1 : verdict.passed ? 0.5 : 0,
				label: gotBoth ? 'both_intents' : verdict.passed ? 'partial' : 'missed',
				explanation: gotBoth ? 'both publish_note and export_document called' : verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-vague-search-then-update',
		name: 'searches first then writes when user is uncertain if content exists',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: {
			prompt:
				"I wrote about this before somewhere... if I did can you add today's finding: the latency spike was caused by connection pool exhaustion"
		},
		expected: { required: ['search'], atLeastOneOf: [['save_note', 'create_note']] },
		metadata: {
			layer: 'agent',
			note: 'Conditional: search first, then write. Tests search → write sequencing with uncertain user.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const verdict = scoreIntentInterpretation(result, {
				required: ['search'],
				atLeastOneOf: [['save_note', 'create_note']],
				maxCalls: 10
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'search_then_write' : 'incomplete',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-whats-my-situation',
		name: 'does something useful for a maximally ambiguous prompt',
		splits: [ARCHETYPES.intentInterpretation],
		input: { prompt: "What's my situation right now?" },
		expected: {
			atLeastOneOf: [['list_todos', 'get_workspace_context', 'list_project_memory', 'search']]
		},
		metadata: {
			layer: 'agent',
			note: 'Maximally ambiguous. Many valid tools — just must do SOMETHING useful, not answer from thin air.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const projectId = workspace.projectIds.get('Platform');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				...(projectId ? { projectId } : {})
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 400)
			});

			const verdict = scoreIntentInterpretation(result, {
				atLeastOneOf: [['list_todos', 'get_workspace_context', 'list_project_memory', 'search']],
				maxCalls: 8
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'grounded' : 'guessed',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'intent-onboarding-context',
		name: 'gathers broad context for a wide-scope informational request',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.multiStep],
		input: {
			prompt:
				"I'm onboarding someone onto the platform stuff next week, pull together everything they'd need to see"
		},
		expected: { required: ['search'], minDistinctTools: 2 },
		metadata: {
			layer: 'agent',
			note: 'Wide-scope gathering: should search + read multiple sources. Tests breadth of retrieval.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, todosWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 500)
			});

			const verdict = scoreIntentInterpretation(result, {
				required: ['search'],
				minDistinctTools: 2,
				maxCalls: 10
			});
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'gathered' : 'shallow',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},

	// ──────────────────────────────────────────────────────────────────────────
	// Natural-language variants: same tool targets as the explicit baseline
	// cases but phrased as a naive user would actually type them.
	// ──────────────────────────────────────────────────────────────────────────

	{
		id: 'natural-chitchat-dismissal',
		name: 'handles ultra-casual sign-off with zero tools',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.stoppingBehavior],
		input: { prompt: "cool, that's all 👍" },
		expected: { maxCalls: 0 },
		metadata: { layer: 'agent', note: 'Vaguer version of stopping-no-tools-for-chitchat.' },
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

			const verdict = scoreStoppingBehavior(result, { maxCalls: 0 });
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'minimal' : 'over_called',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-vague-project-creation',
		name: 'creates a project from a vague "set me up" request',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.toolDiscovery],
		input: { prompt: "I'm starting something new around analytics tracking, set me up" },
		expected: { tool: 'create_project' },
		metadata: { layer: 'agent', note: 'Vaguer version of stopping-mutation-within-budget.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolDiscovery(result, 'create_project');
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'interpreted' : 'missed',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-project-conventions',
		name: 'reads project memory when asked how things are usually done',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.contextAwareness],
		input: { prompt: 'How do we usually do things around here?' },
		expected: { requiredTools: ['list_project_memory'] },
		metadata: { layer: 'agent', note: 'Vaguer version of context-project-scoped-memory.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, conflictingScopeWorkspace);
			const projectId = workspace.projectIds.get('Ledger Service');
			if (!projectId) throw new Error('Ledger Service project was not seeded');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				projectId
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolCalling(result, { required: ['list_project_memory'] });
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'scoped' : 'missed_scope',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-vague-search',
		name: 'searches when the user vaguely recalls writing something',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.toolCalling],
		input: { prompt: 'I wrote something about how we deploy, somewhere...' },
		expected: { requiredTools: ['search'] },
		metadata: { layer: 'agent', note: 'Vaguer version of context-no-project-uses-search.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const verdict = scoreToolCalling(result, { required: ['search'] });
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'searched' : 'guessed',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-deploy-code-recall',
		name: 'retrieves a specific code from notes without naming the source',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.contextAwareness],
		input: { prompt: "There's a code I always have to type after deploys, what was it?" },
		expected: { containsHash: GROUNDING_HASH },
		metadata: { layer: 'agent', note: 'Vaguer version of grounding-search-reproduces-hash.' },
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

			const containsHash = result.finalResponse.includes(GROUNDING_HASH);
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: containsHash ? 1 : 0,
				label: containsHash ? 'grounded' : 'hallucinated',
				explanation: containsHash
					? `response contains ${GROUNDING_HASH}`
					: `response did NOT contain ${GROUNDING_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(containsHash, `response must contain ${GROUNDING_HASH}`).toBe(true);
		}
	},
	{
		id: 'natural-employee-id-recall',
		name: 'recalls employee ID from memory without being told where to look',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.contextAwareness],
		input: { prompt: "What's my employee ID again?" },
		expected: { containsHash: MEMORY_HASH },
		metadata: { layer: 'agent', note: 'Vaguer version of grounding-memory-reproduces-hash.' },
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

			const containsHash = result.finalResponse.includes(MEMORY_HASH);
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: containsHash ? 1 : 0,
				label: containsHash ? 'recalled' : 'missed',
				explanation: containsHash
					? `response contains ${MEMORY_HASH}`
					: `response did NOT contain ${MEMORY_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(containsHash, `response must contain ${MEMORY_HASH}`).toBe(true);
		}
	},
	{
		id: 'natural-runbook-code',
		name: 'finds a verification code in a note with vague phrasing',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.contextAwareness],
		input: { prompt: 'I put a verification code in my runbook somewhere, what is it?' },
		expected: { containsHash: GROUNDING_HASH },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of grounding-note-read-reproduces-hash.'
		},
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

			const containsHash = result.finalResponse.includes(GROUNDING_HASH);
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: containsHash ? 1 : 0,
				label: containsHash ? 'found' : 'missed',
				explanation: containsHash
					? `response contains ${GROUNDING_HASH}`
					: `response did NOT contain ${GROUNDING_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(containsHash, `response must contain ${GROUNDING_HASH}`).toBe(true);
		}
	},
	{
		id: 'natural-skill-without-naming',
		name: 'loads a skill from domain context without being told which skill',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.skillAdherence],
		input: { prompt: 'Put together a compliance summary for the audit prep' },
		expected: { containsHash: SKILL_HASH },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of skill-loaded-produces-hash. Skill is in requestedSkillNames but user does not name it.'
		},
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
				response: result.finalResponse.slice(0, 400)
			});

			const containsHash = result.finalResponse.includes(SKILL_HASH);
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: containsHash ? 1 : 0,
				label: containsHash ? 'skill_applied' : 'skill_ignored',
				explanation: containsHash
					? `response contains ${SKILL_HASH} — skill instructions followed`
					: `response did NOT contain ${SKILL_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(containsHash, `response must contain ${SKILL_HASH}`).toBe(true);
		}
	},
	{
		id: 'natural-skill-from-domain',
		name: 'discovers and applies a skill from domain language alone',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.skillAdherence],
		input: {
			prompt: 'Write me a compliance-style status update on where we are with the audit'
		},
		expected: { containsHash: SKILL_HASH },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of skill-discovered-by-name. Skill must be inferred from "compliance-style".'
		},
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
				response: result.finalResponse.slice(0, 400)
			});

			const containsHash = result.finalResponse.includes(SKILL_HASH);
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: containsHash ? 1 : 0,
				label: containsHash ? 'skill_applied' : 'skill_missed',
				explanation: containsHash
					? `response contains ${SKILL_HASH}`
					: `response did NOT contain ${SKILL_HASH}`
			});

			expect(result.status).toBe('completed');
			expect(containsHash, `response must contain ${SKILL_HASH}`).toBe(true);
		}
	},
	{
		id: 'natural-selection-commitments',
		name: 'extracts commitments from a selection with casual phrasing',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.selectionHandling],
		input: {
			prompt: 'What did I commit to here?',
			selectionText:
				'I will deploy the new payment gateway by Friday and notify the downstream teams once traffic is migrated.'
		},
		expected: { tool: 'extract_promises' },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of selection-triggers-extract-promises.'
		},
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
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'extracted' : 'missed',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-selection-find-related',
		name: 'finds references for a selection without naming the tool',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.selectionHandling],
		input: {
			prompt: 'Do I have anything else about this?',
			selectionText:
				'The Checkout API calls the Payment Gateway to authorise the card, and waits for the authorisation result.'
		},
		expected: { tool: 'find_references' },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of selection-triggers-find-references.'
		},
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
				name: ARCHETYPES.intentInterpretation,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'found' : 'missed',
				explanation: verdict.explanation
			});

			expect(result.status).toBe('completed');
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'natural-context-compare-notes',
		name: 'answers from multiple attached notes when asked about their relationship',
		splits: [ARCHETYPES.intentInterpretation, ARCHETYPES.contextAwareness],
		input: { prompt: "Are these related? What's the thread between them?" },
		expected: { mentionsBothNotes: true },
		metadata: {
			layer: 'agent',
			note: 'Vaguer version of context-note-ids-reads-all. contextNoteIds provided; both notes ride inside the user message.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, retrievalCorpusWorkspace);
			const noteIds = [...workspace.noteIds.values()].slice(0, 2);
			if (noteIds.length < 2) throw new Error('Need at least 2 notes');

			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				contextNoteIds: noteIds
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				response: result.finalResponse.slice(0, 300)
			});

			const response = result.finalResponse.toLowerCase();
			const passed = response.includes('postgres') && response.includes('redis');
			px.logAnnotation({
				name: ARCHETYPES.intentInterpretation,
				score: passed ? 1 : 0,
				label: passed ? 'read_both' : 'incomplete',
				explanation: `response mentions Postgres: ${response.includes('postgres')}, Redis: ${response.includes('redis')}`
			});

			expect(result.status).toBe('completed');
			expect(
				passed,
				'response should draw on both attached notes (Postgres failover and Redis eviction runbooks)'
			).toBe(true);
		}
	}
];
