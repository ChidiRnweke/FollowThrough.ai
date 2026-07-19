import { describe, expect, it } from 'vitest';
import type { FunctionTool } from '@openai/agents';
import type { ControllerFactory } from '$lib/factories';
import { InMemoryToolRetriever } from '$lib/testing/fakes/in-memory-agent';
import { testActor, testProvenanceId } from '$lib/testing/fixtures/domain-builders';
import {
	AgentToolRegistry,
	agentToolCoverage,
	type AgentToolClassification
} from './agent-tool-registry';

const registry = (mode: 'approval_required' | 'auto_accept') =>
	new AgentToolRegistry({} as ControllerFactory, testActor(), mode, {
		provenanceId: testProvenanceId(),
		input: { prompt: 'Help' },
		model: 'openai/gpt-5.6'
	});

const approvalFor = async (
	mode: 'approval_required' | 'auto_accept',
	name: string
): Promise<boolean> => {
	const selected = registry(mode)
		.tools()
		.find((candidate) => candidate.name === name) as FunctionTool;
	return selected.needsApproval({} as never, {} as never, 'call-1');
};

const indirectToolFor = (
	mode: 'approval_required' | 'auto_accept',
	name: 'search_tools' | 'use_tool',
	options: { factory?: ControllerFactory; retriever?: InMemoryToolRetriever } = {}
): FunctionTool =>
	new AgentToolRegistry(
		options.factory ?? ({} as ControllerFactory),
		testActor(),
		mode,
		{
			provenanceId: testProvenanceId(),
			input: { prompt: 'Help' },
			model: 'openai/gpt-5.6'
		},
		undefined,
		options.retriever
	)
		.agentTools()
		.find((candidate) => candidate.name === name) as FunctionTool;

describe('Agent tool coverage invariants', () => {
	it('classifies every covered controller method', () => {
		const classifications = Object.values(agentToolCoverage).flatMap((controller) =>
			Object.values(controller).map((classification) => classification.kind)
		);
		expect(
			classifications.every((kind) => ['read', 'proposal', 'mutation', 'excluded'].includes(kind))
		).toBe(true);
	});

	it('registers one stable tool for every non-excluded controller action', () => {
		const classifications = Object.values(agentToolCoverage).flatMap(
			(controller) => Object.values(controller) as AgentToolClassification[]
		);
		const coveredActions = classifications.filter(
			(classification) => classification.kind !== 'excluded'
		).length;
		// memory.list is deliberately exposed twice: list_project_memory and list_user_memory.
		const scopedAliases = 1;
		expect(registry('approval_required').tools()).toHaveLength(coveredActions + scopedAliases);
	});

	it('exposes the user profile as a read tool', async () => {
		expect(await approvalFor('approval_required', 'list_user_memory')).toBe(false);
	});

	it('keeps only frequent grounding and memory-proposal tools directly available', () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = new AgentToolRegistry(
			{} as ControllerFactory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { prompt: 'Create a note' },
				model: 'openai/gpt-5.6'
			},
			undefined,
			retriever
		).agentTools();
		expect(selected.map((tool) => tool.name)).toEqual([
			'search',
			'list_user_memory',
			'list_project_memory',
			'get_workspace_context',
			'get_note',
			'list_todos',
			'load_skill',
			'propose_memory_change',
			'search_tools',
			'use_tool'
		]);
	});

	it('keeps action tools in the searchable long-tail catalog', () => {
		expect(
			registry('auto_accept')
				.catalog()
				.some((tool) => tool.name === 'create_note')
		).toBe(true);
	});

	it('excludes first-class tools from the searchable long-tail catalog', () => {
		const names = new Set(
			registry('auto_accept')
				.catalog()
				.map((tool) => tool.name)
		);
		expect(
			[
				'search',
				'list_user_memory',
				'list_project_memory',
				'get_workspace_context',
				'get_note',
				'list_todos',
				'load_skill',
				'propose_memory_change'
			].filter((name) => names.has(name))
		).toEqual([]);
	});

	it('returns exact long-tail schemas from tool search', async () => {
		const retriever = new InMemoryToolRetriever();
		retriever.names = ['create_note'];
		const selected = indirectToolFor('auto_accept', 'search_tools', { retriever });
		const result = await selected.invoke({} as never, JSON.stringify({ query: 'create a note' }));
		expect(result).toMatchObject([
			{
				name: 'create_note',
				classification: 'mutation',
				input_schema: { type: 'object' }
			}
		]);
	});

	it('requires approval for long-tail mutations in approval-required mode', async () => {
		const selected = indirectToolFor('approval_required', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'create_note', payload: { title: 'Decision log' } } as never,
				'call-1'
			)
		).toBe(true);
	});

	it('runs long-tail mutations without approval in auto-accept mode', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'create_note', payload: { title: 'Decision log' } } as never,
				'call-1'
			)
		).toBe(false);
	});

	it('runs long-tail reads without approval', async () => {
		const selected = indirectToolFor('approval_required', 'use_tool');
		expect(
			await selected.needsApproval(
				{} as never,
				{ name: 'list_projects', payload: {} } as never,
				'call-1'
			)
		).toBe(false);
	});

	it('dispatches an exact long-tail tool name to its controller', async () => {
		const factory = {
			projects: () => ({ list: async () => ['General'] })
		} as unknown as ControllerFactory;
		const selected = indirectToolFor('auto_accept', 'use_tool', { factory });
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'list_projects', payload: {} })
		);
		expect(result).toEqual(['General']);
	});

	it('does not execute a guessed long-tail tool name', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'creat_note', payload: { title: 'Decision log' } })
		);
		expect(result).toEqual({ error: 'No tool named "creat_note". Did you mean "create_note"?' });
	});

	it('returns model-readable validation errors for invalid long-tail payloads', async () => {
		const selected = indirectToolFor('auto_accept', 'use_tool');
		const result = await selected.invoke(
			{} as never,
			JSON.stringify({ name: 'create_note', payload: {} })
		);
		expect(result).toMatchObject({ error: expect.stringContaining('Invalid payload') });
	});

	it('does not expose the agent controller recursively', () => {
		const names = registry('approval_required')
			.tools()
			.map((candidate) => candidate.name);
		expect(names.some((name) => name === 'run_agent')).toBe(false);
	});

	it('pauses mutation tools in approval-required mode', async () => {
		expect(await approvalFor('approval_required', 'create_note')).toBe(true);
	});

	it('executes proposal tools without approval', async () => {
		expect(await approvalFor('approval_required', 'extract_promises')).toBe(false);
	});

	it('executes mutation tools immediately in auto-accept mode', async () => {
		expect(await approvalFor('auto_accept', 'create_note')).toBe(false);
	});

	it('exposes lazy skill loading as a read tool', async () => {
		expect(await approvalFor('approval_required', 'load_skill')).toBe(false);
	});

	it('limits diagram workflows to read-only controller tools', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect(names.includes('generate_mermaid_diagram')).toBe(false);
	});

	it('allows diagram workflows to read shared project memory', () => {
		const names = registry('auto_accept')
			.tools({ classifications: ['read'] })
			.map((candidate) => candidate.name);
		expect(names.includes('list_project_memory')).toBe(true);
	});

	it('executes agent actions through the actor-scoped controller factory', async () => {
		let received: unknown;
		const factory = {
			notes: () => ({
				create: async (actor: unknown, input: unknown) => {
					received = { actor, input };
					return { note: { id: 'note-1' } };
				}
			})
		} as unknown as ControllerFactory;
		const selected = new AgentToolRegistry(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Create a note' },
			model: 'openai/gpt-5.6'
		})
			.tools()
			.find((candidate) => candidate.name === 'create_note') as FunctionTool;
		await selected.invoke({} as never, JSON.stringify({ title: 'Agent draft' }));
		expect(received).toEqual({ actor: testActor(), input: { title: 'Agent draft' } });
	});

	it('uses the effective conversation model for reference search', async () => {
		let receivedModel: string | undefined;
		const factory = {
			references: () => ({
				suggestFromSelection: async (
					_actor: unknown,
					_input: unknown,
					options?: { model?: string }
				) => {
					receivedModel = options?.model;
					return { outcome: 'nothing_relevant' };
				}
			})
		} as unknown as ControllerFactory;
		const selected = new AgentToolRegistry(factory, testActor(), 'auto_accept', {
			provenanceId: testProvenanceId(),
			input: { prompt: 'Find references' },
			model: 'anthropic/claude-sonnet-4.5'
		})
			.tools()
			.find((candidate) => candidate.name === 'find_references') as FunctionTool;
		await selected.invoke(
			{} as never,
			JSON.stringify({
				selection: {
					noteId: '00000000-0000-4000-8000-000000000001',
					revision: 1,
					from: 0,
					to: 4,
					text: 'OAuth'
				}
			})
		);
		expect(receivedModel).toBe('anthropic/claude-sonnet-4.5');
	});
});
