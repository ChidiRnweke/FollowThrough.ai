import { describe, expect, it } from 'vitest';
import { AgentToolCatalogService } from './tool-catalog';
import { LOCKED_TOOL_NAMES } from '$lib/models/agent/tool-catalog';

describe('Agent tool catalog', () => {
	it('marks the locked tools as locked', () => {
		expect(
			new AgentToolCatalogService()
				.entries()
				.filter((entry) => entry.locked)
				.map((entry) => entry.name)
				.sort()
		).toEqual([...LOCKED_TOOL_NAMES].sort());
	});
});
