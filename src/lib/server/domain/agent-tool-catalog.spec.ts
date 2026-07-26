import { describe, expect, it } from 'vitest';
import type { ControllerFactory } from '$lib/factories';
import { testActor, testProvenanceId } from '$lib/testing/fixtures/domain-builders';
import { describeAgentTools } from './agent-tool-catalog';
import { AgentToolRegistry, LOCKED_TOOL_NAMES } from './agent-tool-registry';

const registryNames = () =>
	new AgentToolRegistry({} as ControllerFactory, testActor(), 'auto_accept', {
		provenanceId: testProvenanceId(),
		input: { prompt: '' },
		model: 'openai/gpt-5.6'
	})
		.definitions()
		.map((definition) => definition.name);

describe('Agent tool catalog', () => {
	it('describes exactly the tools the registry defines', () => {
		expect(describeAgentTools().map((entry) => entry.name)).toEqual(registryNames());
	});

	it('marks the locked tools as locked', () => {
		expect(
			describeAgentTools()
				.filter((entry) => entry.locked)
				.map((entry) => entry.name)
				.sort()
		).toEqual([...LOCKED_TOOL_NAMES].sort());
	});

	it('gives every tool a description for the settings list to search', () => {
		expect(describeAgentTools().every((entry) => entry.description.length > 0)).toBe(true);
	});
});
