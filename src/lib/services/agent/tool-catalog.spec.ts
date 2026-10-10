import { agentToolNameSchema } from '$lib/models/agent';
import { toolNameSchema } from '$lib/models/agent';
import { describe, expect, it } from 'vitest';
import { TOOL_DESCRIPTIONS } from '$lib/models/agent/tool-catalog';
import { toolDescription } from '$lib/services/agent/tool-catalog';
import { TOOL_CATALOG } from '$lib/services/agent/tool-catalog';
import { FIRST_CLASS_TOOL_SET } from '$lib/services/agent/tool-catalog';

describe('tool catalog', () => {
	it('lists no duplicate tool names', () => {
		expect(new Set(TOOL_DESCRIPTIONS.map((entry) => entry.name)).size).toBe(
			TOOL_DESCRIPTIONS.length
		);
	});

	it('keeps first-class tools out of the on-demand catalog', () => {
		expect(TOOL_CATALOG.every((entry) => !FIRST_CLASS_TOOL_SET.has(entry.name))).toBe(true);
	});

	it('fails fast when a name drifts from the catalog', () => {
		expect(() => toolDescription('not_a_tool')).toThrow(
			'Tool description missing from catalog: not_a_tool'
		);
	});

	/**
	 * The two readers every persisted and provider-supplied tool name goes
	 * through: `AgentToolEventMapper` and `readPendingDecisions` for the wide one,
	 * `parkedCall` for the narrow one. They differ by exactly `search_tools`,
	 * which `AgentTools.agentTools()` assembles rather than defines — so it is a
	 * name the journal stores and never a name a run can park on.
	 */
	it('reads a catalog name into both tool boundaries', () => {
		expect({
			agent: agentToolNameSchema.safeParse('save_note').data,
			catalog: toolNameSchema.safeParse('save_note').data
		}).toEqual({
			agent: 'save_note',
			catalog: 'save_note'
		});
	});

	it('reads search_tools, which has no catalog entry', () => {
		expect({
			agent: agentToolNameSchema.safeParse('search_tools').data,
			catalog: toolNameSchema.safeParse('search_tools').data
		}).toEqual({ agent: 'search_tools', catalog: undefined });
	});

	it('refuses a name the agent surface does not have', () => {
		expect(agentToolNameSchema.safeParse('save_notes').data).toBeUndefined();
	});

	it('routes vague note cleanup away from whole-body replacement', () => {
		expect(toolDescription('save_note')).toContain(
			'A request to tidy, refresh, polish, or improve an existing note is not a full rewrite'
		);
	});
});
