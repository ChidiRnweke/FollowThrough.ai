import { describe, expect, it } from 'vitest';
import type { FunctionTool } from '@openai/agents';
import type { ControllerFactory } from '$lib/factories';
import { testActor, testProvenanceId } from '$lib/testing/fixtures/domain-builders';
import {
	AgentToolRegistry,
	agentToolCoverage,
	type AgentToolClassification
} from './agent-tool-registry';

const registry = (mode: 'approval_required' | 'auto_accept') =>
	new AgentToolRegistry({} as ControllerFactory, testActor(), mode, {
		provenanceId: testProvenanceId(),
		input: { prompt: 'Help' }
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
		expect(registry('approval_required').tools()).toHaveLength(coveredActions);
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
			input: { prompt: 'Create a note' }
		})
			.tools()
			.find((candidate) => candidate.name === 'create_note') as FunctionTool;
		await selected.invoke({} as never, JSON.stringify({ title: 'Agent draft' }));
		expect(received).toEqual({ actor: testActor(), input: { title: 'Agent draft' } });
	});
});
