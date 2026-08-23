import { describe, expect, it } from 'vitest';
import { describeAgentTools } from './agent-tool-catalog-factory';
import { LOCKED_TOOL_NAMES } from './agent-tool-factory';

describe('Agent tool catalog', () => {
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
