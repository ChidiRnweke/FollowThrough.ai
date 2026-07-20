import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { conflictingScopeWorkspace } from '../fixtures/workspaces/engineering';
import { findCall, scoreToolCalling, scoreToolDiscovery } from '../assertions/tool-calls';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * The agent-level half of tool coverage.
 *
 * `tool-retrieval` proves a capability is *reachable*; these prove the agent
 * actually reaches it. Splitting the two matters because they fail for
 * different reasons and have different fixes: a retrieval miss is a description
 * problem in the catalog, an invocation miss is a model or prompt problem.
 *
 * Payload checks stay deliberately loose — asserting an exact argument object
 * would fail on harmless paraphrasing ("Q3 review" vs "Q3 architecture review")
 * and teach us nothing. They assert the shape the controller needs.
 */

interface InvocationCase {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly tool: string;
	/** Checks the dispatched arguments are usable, not word-for-word. */
	readonly payload?: (args: Record<string, unknown>) => string | undefined;
	readonly firstClass?: boolean;
}

const usableString = (value: unknown): boolean =>
	typeof value === 'string' && value.trim().length > 0;

const CASES: readonly InvocationCase[] = [
	{
		id: 'invoke-create-note',
		name: 'creates a note when asked to start one',
		prompt: 'Start a new note in my Profile project called "Weekly platform sync".',
		tool: 'create_note',
		payload: (args) => (usableString(args.title) ? undefined : 'title was missing or empty')
	},
	{
		id: 'invoke-create-todo',
		name: 'creates a todo with a usable title',
		prompt: 'Remind me to renew the TLS certificates before the end of the month.',
		tool: 'create_todo',
		payload: (args) => (usableString(args.title) ? undefined : 'title was missing or empty')
	},
	{
		id: 'invoke-create-project',
		name: 'creates a project with the requested name',
		prompt: 'Create a project called "Platform Migration" please.',
		tool: 'create_project',
		payload: (args) =>
			typeof args.name === 'string' && args.name.toLowerCase().includes('platform')
				? undefined
				: `name did not reflect the request: ${JSON.stringify(args.name)}`
	},
	{
		id: 'invoke-list-todos',
		name: 'lists todos rather than inventing them',
		prompt: 'What is on my todo list right now?',
		tool: 'list_todos',
		firstClass: true
	},
	{
		id: 'invoke-get-workspace-context',
		name: 'reads workspace context when asked what exists',
		prompt: 'Give me an overview of my workspace — projects, notes, anything pending.',
		tool: 'get_workspace_context',
		firstClass: true
	},
	{
		id: 'invoke-list-project-memory',
		name: 'reads project memory when scoped to a project',
		prompt: 'What has this project recorded about how we do things? Check the project memory.',
		tool: 'list_project_memory',
		firstClass: true
	},
	{
		id: 'invoke-list-suggestions',
		name: 'lists pending suggestions for review',
		prompt: 'Is there anything waiting for me to review or approve?',
		tool: 'list_suggestions'
	},
	{
		id: 'invoke-today-view',
		name: 'reads the day view when asked about today',
		prompt: 'What is due today? Today is 2026-07-20.',
		tool: 'get_today_view'
	},
	{
		id: 'invoke-list-skills',
		name: 'lists skills when asked what it can do',
		prompt: 'What reusable skills do you have configured for me?',
		tool: 'list_skills'
	},
	{
		id: 'invoke-export-document',
		name: 'exports a document when asked for a shareable file',
		prompt: 'Turn my Background note into a PDF I can send to someone.',
		tool: 'export_document'
	}
];

export const toolInvocationCases: readonly EvalCase[] = CASES.map((entry) => ({
	id: entry.id,
	name: entry.name,
	splits: [entry.firstClass ? ARCHETYPES.toolCalling : ARCHETYPES.toolDiscovery],
	input: { prompt: entry.prompt },
	expected: { tool: entry.tool, firstClass: entry.firstClass ?? false },
	metadata: { layer: 'agent', tool: entry.tool },
	async run(lab) {
		const workspace = await seedWorkspace(lab, personaWorkspace);
		const result = await runCase(lab, workspace.actor, {
			prompt: entry.prompt,
			mode: 'auto_accept'
		});

		const call = findCall(result, entry.tool);
		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			arguments: call?.arguments,
			response: result.finalResponse.slice(0, 400)
		});

		// First-class tools are registered directly; everything else has to be
		// found through the catalog first, so the two are scored differently.
		if (entry.firstClass) {
			const verdict = scoreToolCalling(result, { required: [entry.tool] });
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});
			expect(verdict.passed, verdict.explanation).toBe(true);
		} else {
			const verdict = scoreToolDiscovery(result, entry.tool);
			px.logAnnotation({
				name: ARCHETYPES.toolDiscovery,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});
			expect(verdict.passed, verdict.explanation).toBe(true);
		}

		if (entry.payload) {
			const problem = call
				? entry.payload(call.arguments as Record<string, unknown>)
				: 'tool never ran';
			px.logAnnotation({
				name: ARCHETYPES.toolPayload,
				score: problem ? 0 : 1,
				label: problem ? 'invalid' : 'valid',
				explanation: problem ?? `usable arguments: ${JSON.stringify(call?.arguments)}`
			});
			expect(problem, problem ?? 'payload was usable').toBeUndefined();
		}
	}
}));

/**
 * Does the agent reach for the catalog at all when the capability it needs is
 * not already in hand? Scored separately from whether it then picked correctly,
 * because "never searched" and "searched and chose badly" are different bugs.
 */
export const toolSearchTriggerCases: readonly EvalCase[] = [
	{
		id: 'search-trigger-out-of-band',
		name: 'searches the catalog for a capability it was not handed',
		splits: [ARCHETYPES.toolSearchTrigger],
		input: { prompt: 'Please archive the Data Platform project, I am done with it.' },
		expected: { requiredTools: ['search_tools'] },
		metadata: { layer: 'agent', note: 'archive_project is not first-class.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, conflictingScopeWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({ model: result.model, toolCalls: result.calledToolNames });

			const verdict = scoreToolCalling(result, { required: ['search_tools'] });
			px.logAnnotation({
				name: ARCHETYPES.toolSearchTrigger,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'searched' : 'did_not_search',
				explanation: verdict.explanation
			});
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	},
	{
		id: 'search-trigger-negative-first-class',
		name: 'does not search the catalog for a tool it already has',
		splits: [ARCHETYPES.toolSearchTrigger, 'negative'],
		input: { prompt: 'Search my notes for anything about deployment platforms.' },
		expected: { forbiddenTools: ['search_tools'] },
		metadata: {
			layer: 'agent',
			note: 'search is first-class; reaching for the catalog is wasted work.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, personaWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({ model: result.model, toolCalls: result.calledToolNames });

			const verdict = scoreToolCalling(result, {
				required: ['search'],
				forbidden: ['search_tools']
			});
			px.logAnnotation({
				name: ARCHETYPES.toolSearchTrigger,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'used_direct_tool' : 'unnecessary_search',
				explanation: verdict.explanation
			});
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	}
];
