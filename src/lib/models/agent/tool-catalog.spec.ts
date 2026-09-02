import { describe, expect, it } from 'vitest';
import {
	FIRST_CLASS_TOOL_NAMES,
	FIRST_CLASS_TOOL_SET,
	TOOL_CATALOG,
	TOOL_DESCRIPTIONS,
	readAgentToolName,
	readToolName,
	toolDescription
} from './tool-catalog';

describe('tool catalog', () => {
	it('lists no duplicate tool names', () => {
		expect(new Set(TOOL_DESCRIPTIONS.map((entry) => entry.name)).size).toBe(
			TOOL_DESCRIPTIONS.length
		);
	});

	it('describes every first-class tool', () => {
		expect(
			FIRST_CLASS_TOOL_NAMES.every((name) => TOOL_DESCRIPTIONS.some((entry) => entry.name === name))
		).toBe(true);
	});

	it('keeps first-class tools out of the on-demand catalog', () => {
		expect(TOOL_CATALOG.every((entry) => !FIRST_CLASS_TOOL_SET.has(entry.name))).toBe(true);
	});

	it('keeps every other tool in the on-demand catalog', () => {
		expect(TOOL_CATALOG.length).toBe(TOOL_DESCRIPTIONS.length - FIRST_CLASS_TOOL_NAMES.length);
	});

	it('resolves a description by name', () => {
		expect(toolDescription('get_note')).toBe(
			TOOL_DESCRIPTIONS.find((entry) => entry.name === 'get_note')!.description
		);
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
	it('reads a catalog name into the agent surface', () => {
		expect(readAgentToolName('save_note')).toBe('save_note');
	});

	it('reads search_tools, which has no catalog entry', () => {
		expect(readAgentToolName('search_tools')).toBe('search_tools');
	});

	it('refuses a name the agent surface does not have', () => {
		expect(readAgentToolName('save_notes')).toBeUndefined();
	});

	it('reads a catalog name into the catalog', () => {
		expect(readToolName('save_note')).toBe('save_note');
	});

	it('refuses search_tools as a catalog name, because nothing binds it', () => {
		expect(readToolName('search_tools')).toBeUndefined();
	});

	it('routes vague note cleanup away from whole-body replacement', () => {
		expect(toolDescription('save_note')).toContain(
			'A request to tidy, refresh, polish, or improve an existing note is not a full rewrite'
		);
	});
});
